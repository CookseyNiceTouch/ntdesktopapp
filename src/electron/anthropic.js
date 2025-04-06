import { Anthropic } from '@anthropic-ai/sdk';
import { ipcMain } from 'electron';

// Initialize the Anthropic client
let anthropicClient = null;

export function setupAnthropicHandlers() {
  // Initialize Anthropic client when we get the API key
  ipcMain.handle('anthropic:init', (event, apiKey) => {
    try {
      console.log('[MAIN] Initializing Anthropic client');
      anthropicClient = new Anthropic({
        apiKey: apiKey,
      });
      console.log('[MAIN] Anthropic client initialized successfully');
      return { success: true };
    } catch (error) {
      console.error('[MAIN] Error initializing Anthropic:', error);
      return { success: false, error: error.message };
    }
  });

  // Create a message
  ipcMain.handle('anthropic:createMessage', async (event, options) => {
    try {
      if (!anthropicClient) {
        throw new Error('Anthropic client not initialized');
      }
      
      console.log('[MAIN] Creating non-streaming message with model:', options.model);
      
      // Ensure message format is correct
      if (!options.messages || !Array.isArray(options.messages) || options.messages.length === 0) {
        throw new Error('Invalid message format. Messages array is required and must have at least one message.');
      }
      
      // Make sure streaming is disabled
      if (options.stream === true) {
        options.stream = false;
      }
      
      // Start time for performance measurement
      const startTime = Date.now();
      
      const response = await anthropicClient.messages.create(options);
      
      const endTime = Date.now();
      console.log(`[MAIN] Message created successfully. Time: ${endTime - startTime}ms`);
      
      return { success: true, data: response };
    } catch (error) {
      console.error('[MAIN] Error creating message:', error);
      return { success: false, error: error.message || error.toString() };
    }
  });
  
  // Stream a message
  ipcMain.on('anthropic:streamMessage', async (event, options, messageId) => {
    try {
      if (!anthropicClient) {
        console.error('[MAIN] Stream failed: Anthropic client not initialized');
        event.sender.send(`anthropic:stream:${messageId}:error`, { error: 'Anthropic client not initialized' });
        return;
      }
      
      console.log(`[MAIN] Starting stream for messageId: ${messageId} with model: ${options.model}`);
      
      // Ensure message format is correct before sending
      if (!options.messages || !Array.isArray(options.messages) || options.messages.length === 0) {
        throw new Error('Invalid message format. Messages array is required and must have at least one message.');
      }
      
      // Make sure to have valid stream parameter
      if (options.stream !== true) {
        options.stream = true;
      }
      
      // Check the Anthropic SDK version and create the stream
      console.log(`[MAIN] Anthropic SDK version: ${Anthropic.VERSION || 'unknown'}`);
      
      const stream = await anthropicClient.messages.stream(options);
      console.log(`[MAIN] Stream created successfully for messageId: ${messageId}`);
      
      // Handle stream events
      stream.on('message_start', (messageStartEvent) => {
        console.log(`[MAIN] message_start event for ${messageId}:`, messageStartEvent);
        event.sender.send(`anthropic:stream:${messageId}:message_start`, messageStartEvent);
      });
      
      stream.on('content_block_start', (contentBlockStartEvent) => {
        console.log(`[MAIN] content_block_start event for ${messageId}, index: ${contentBlockStartEvent.index}`);
        event.sender.send(`anthropic:stream:${messageId}:content_block_start`, contentBlockStartEvent);
      });
      
      stream.on('content_block_delta', (contentBlockDeltaEvent) => {
        // Only log first few deltas to prevent console spam
        if (contentBlockDeltaEvent.index === 0 && (!global.deltaCount || global.deltaCount < 3)) {
          global.deltaCount = (global.deltaCount || 0) + 1;
          console.log(`[MAIN] content_block_delta event for ${messageId}, delta type: ${contentBlockDeltaEvent.delta.type}`);
        }
        event.sender.send(`anthropic:stream:${messageId}:content_block_delta`, contentBlockDeltaEvent);
      });
      
      stream.on('content_block_stop', (contentBlockStopEvent) => {
        console.log(`[MAIN] content_block_stop event for ${messageId}, index: ${contentBlockStopEvent.index}`);
        event.sender.send(`anthropic:stream:${messageId}:content_block_stop`, contentBlockStopEvent);
      });
      
      stream.on('message_delta', (messageDeltaEvent) => {
        console.log(`[MAIN] message_delta event for ${messageId}:`, messageDeltaEvent);
        event.sender.send(`anthropic:stream:${messageId}:message_delta`, messageDeltaEvent);
      });
      
      stream.on('message_stop', (messageStopEvent) => {
        console.log(`[MAIN] message_stop event for ${messageId}:`, messageStopEvent);
        event.sender.send(`anthropic:stream:${messageId}:message_stop`, messageStopEvent);
        // Reset delta counter after message complete
        global.deltaCount = 0;
      });
      
      stream.on('error', (error) => {
        console.error(`[MAIN] Stream error for ${messageId}:`, error);
        const errorData = { 
          error: error.message || error.toString(),
          details: error.details || 'No details provided'
        };
        event.sender.send(`anthropic:stream:${messageId}:error`, errorData);
      });
      
      // Add a custom error handler for unexpected errors
      stream.on('uncaughtException', (error) => {
        console.error(`[MAIN] Uncaught exception in stream for ${messageId}:`, error);
        event.sender.send(`anthropic:stream:${messageId}:error`, { 
          error: 'Uncaught exception: ' + (error.message || error.toString())
        });
      });
    } catch (error) {
      console.error(`[MAIN] Error setting up stream for ${messageId}:`, error);
      event.sender.send(`anthropic:stream:${messageId}:error`, { 
        error: error.message || error.toString(),
        stack: error.stack 
      });
    }
  });

  // Enhance streaming support for thinking states
  ipcMain.on('anthropic:streamThinking', async (event, options, messageId) => {
    try {
      // Setup stream with thinking mode enabled
      const stream = await anthropicClient.messages.stream({
        ...options,
        stream: true,
        thinking: true // Hypothetical flag for getting thinking states
      });
      
      // Handle different stream events for thinking, content progression, etc.
    } catch (error) {
      console.error(`[MAIN] Error in thinking stream:`, error);
      event.sender.send(`anthropic:stream:${messageId}:error`, { error: error.message });
    }
  });
} 
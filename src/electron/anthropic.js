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
      
      console.log('[MAIN] Creating message with model:', options.model);
      console.log('[MAIN] Message options:', {
        model: options.model,
        max_tokens: options.max_tokens,
        system: options.system,
        messageCount: options.messages.length,
        hasTools: !!options.tools,
        toolCount: options.tools?.length || 0
      });
      
      // Print tool definitions if present
      if (options.tools && options.tools.length > 0) {
        console.log('[MAIN] Tool definitions:', options.tools.map(tool => ({
          name: tool.name,
          description: tool.description?.substring(0, 50) + (tool.description?.length > 50 ? '...' : '')
        })));
      }
      
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
      
      // Log response content type information
      if (response.content && response.content.length > 0) {
        console.log('[MAIN] Response content types:', response.content.map(item => item.type));
        
        // Log tool usage if present
        const toolUses = response.content.filter(item => item.type === 'tool_use');
        if (toolUses.length > 0) {
          console.log('[MAIN] Tool uses in response:', toolUses.map(tool => ({
            id: tool.id,
            name: tool.name,
            input: tool.input
          })));
        }
      }
      
      return { success: true, data: response };
    } catch (error) {
      console.error('[MAIN] Error creating message:', error);
      return { success: false, error: error.message || error.toString() };
    }
  });
} 
import { Anthropic } from '@anthropic-ai/sdk';
import { ipcMain } from 'electron';

// Initialize the Anthropic client
let anthropicClient = null;

export function setupAnthropicHandlers() {
  // Initialize Anthropic client when we get the API key
  ipcMain.handle('anthropic:init', (event, apiKey) => {
    try {
      anthropicClient = new Anthropic({
        apiKey: apiKey,
      });
      return { success: true };
    } catch (error) {
      console.error('Error initializing Anthropic:', error);
      return { success: false, error: error.message };
    }
  });

  // Create a message
  ipcMain.handle('anthropic:createMessage', async (event, options) => {
    try {
      if (!anthropicClient) {
        throw new Error('Anthropic client not initialized');
      }
      
      const response = await anthropicClient.messages.create(options);
      return { success: true, data: response };
    } catch (error) {
      console.error('Error creating message:', error);
      return { success: false, error: error.message };
    }
  });
} 
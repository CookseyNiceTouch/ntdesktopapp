// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';

// Expose auth API to renderer process
contextBridge.exposeInMainWorld('electronAuth', {
  getAuthToken: () => ipcRenderer.invoke('auth:getToken'),
  setAuthToken: (token) => ipcRenderer.invoke('auth:setToken', token),
  clearAuthToken: () => ipcRenderer.invoke('auth:clearToken')
});

// Expose Anthropic API to renderer process
contextBridge.exposeInMainWorld('electronAnthropic', {
  init: (apiKey) => ipcRenderer.invoke('anthropic:init', apiKey),
  createMessage: (options) => {
    console.log('[PRELOAD] Creating message with options:', {
      model: options.model,
      hasTools: options.tools && options.tools.length > 0,
      messageCount: options.messages.length
    });
    return ipcRenderer.invoke('anthropic:createMessage', options);
  },
  // Keep streamMessage but it won't be used by default
  streamMessage: (options, messageId, callbacks) => {
    // Add detailed logs for stream request
    console.log(`[PRELOAD] Starting stream for messageId: ${messageId}`, {
      model: options.model,
      hasTools: options.tools && options.tools.length > 0,
      messageCount: options.messages.length,
      streaming: options.stream
    });
    
    // Start streaming
    ipcRenderer.send('anthropic:streamMessage', options, messageId);
    
    // Set up event listeners for streaming events
    const eventTypes = [
      'message_start',
      'content_block_start',
      'content_block_delta',
      'content_block_stop',
      'message_delta',
      'message_stop',
      'error'
    ];
    
    const listeners = {};
    
    // Create listeners for each event type
    eventTypes.forEach(eventType => {
      const channelName = `anthropic:stream:${messageId}:${eventType}`;
      const listener = (_, data) => {
        console.log(`[PRELOAD] Received event ${eventType} for ${messageId}`);
        
        if (eventType === 'error') {
          console.error(`[PRELOAD] Stream error:`, data);
        }
        
        if (callbacks[eventType]) {
          try {
            callbacks[eventType](data);
          } catch (error) {
            console.error(`[PRELOAD] Error in ${eventType} callback:`, error);
          }
        } else {
          console.warn(`[PRELOAD] No callback defined for event type: ${eventType}`);
        }
      };
      listeners[eventType] = listener;
      ipcRenderer.on(channelName, listener);
    });
    
    // Return a cleanup function to remove the listeners
    return () => {
      console.log(`[PRELOAD] Cleaning up listeners for messageId: ${messageId}`);
      eventTypes.forEach(eventType => {
        const channelName = `anthropic:stream:${messageId}:${eventType}`;
        ipcRenderer.removeListener(channelName, listeners[eventType]);
      });
    };
  }
});

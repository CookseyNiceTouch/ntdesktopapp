import { spawn } from 'child_process';
import { ipcMain, dialog } from 'electron';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Store active MCP clients
const activeClients = new Map();

export function setupMCPHandlers() {
  // Launch local MCP server
  ipcMain.handle('mcp:launchServer', async (event, { serverPath, clientId }) => {
    try {
      console.log(`[MAIN] Launching MCP server: ${serverPath}`);
      
      // Validate the server path
      if (!serverPath) {
        throw new Error('Server path is required');
      }
      
      // Determine executable based on file extension
      const isJs = serverPath.endsWith('.js');
      const isPy = serverPath.endsWith('.py');
      
      if (!isJs && !isPy) {
        throw new Error('Server script must be a .js or .py file');
      }
      
      // Create appropriate command for the script type
      // Use 'node' explicitly for JavaScript files rather than process.execPath
      const command = isJs 
        ? 'node'
        : (process.platform === 'win32' ? 'python' : 'python3');
      
      const args = [serverPath];
      
      console.log(`[MAIN] Executing command: ${command} with args:`, args);
      
      // Test the command first to make sure it works
      try {
        const testProcess = spawn(command, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: process.platform === 'win32' // Use shell on Windows
        });
        
        // Log errors
        testProcess.on('error', (error) => {
          console.error(`[MAIN] Failed to start process: ${error.message}`);
        });
        
        // Capture stderr output for debugging
        testProcess.stderr.on('data', (data) => {
          console.error(`[MAIN] Server stderr: ${data.toString()}`);
        });
        
        // Give time for immediate errors to show up
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Kill the test process
        testProcess.kill();
      } catch (spawnError) {
        console.error(`[MAIN] Spawn test failed: ${spawnError.message}`);
        throw new Error(`Failed to start server: ${spawnError.message}`);
      }
      
      // Create MCP client
      const mcp = new Client({ 
        name: "nice-touch-app", 
        version: "1.0.0",
        // Add debug mode and compatibility mode for Python servers
        debug: true,
        compatibilityMode: true
      });
      
      // Create transport with improved options
      const transport = new StdioClientTransport({
        command,
        args,
        // Use shell on Windows to ensure command resolution
        shell: process.platform === 'win32',
        // Add detailed debug logging
        onStdErr: (data) => {
          console.error(`[MAIN] Server stderr: ${data.toString()}`);
        },
        onStdin: (data) => {
          console.log(`[MAIN] Sent to server: ${data.toString().substring(0, 200)}...`);
        },
        onStdout: (data) => {
          console.log(`[MAIN] Received from server: ${data.toString().substring(0, 200)}...`);
        },
        onError: (error) => {
          console.error(`[MAIN] Transport error: ${error.message}`);
        }
      });
      
      // Connect to server with better error handling
      console.log(`[MAIN] Connecting to MCP server...`);
      mcp.connect(transport);
      
      // Wait for connection to establish - increase timeout from 1000ms to 5000ms
      console.log(`[MAIN] Waiting for connection to establish...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      console.log(`[MAIN] MCP client connected, retrieving tools...`);
      
      // List available tools with timeout to prevent hanging - increase from 5000ms to 10000ms
      const toolsPromise = mcp.listTools();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Tool listing timed out')), 10000)
      );
      
      const toolsResult = await Promise.race([toolsPromise, timeoutPromise]);
      const tools = toolsResult.tools.map((tool) => {
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        };
      });
      
      // Store client for future use
      activeClients.set(clientId, mcp);
      
      console.log(`[MAIN] MCP server launched with tools: ${tools.map(t => t.name).join(', ')}`);
      
      return { 
        success: true, 
        tools 
      };
    } catch (error) {
      console.error('[MAIN] Error launching MCP server:', error);
      
      // Provide more helpful error messages
      let errorMessage = error.message || error.toString();
      
      if (errorMessage.includes('Connection closed')) {
        errorMessage = 'Server connection closed unexpectedly. Check that your script implements the MCP protocol correctly and has no startup errors.';
      } else if (errorMessage.includes('ENOENT')) {
        errorMessage = `Command not found. Make sure ${error.path || 'the required executable'} is installed and in your PATH.`;
      } else if (errorMessage.includes('timed out')) {
        errorMessage = 'Server did not respond in time. Check that your script properly implements the MCP protocol.';
      }
      
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  });
  
  // Select server file dialog
  ipcMain.handle('mcp:selectServerFile', async (event) => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Scripts', extensions: ['js', 'py'] }
        ]
      });
      
      if (canceled || filePaths.length === 0) {
        return { success: true, filePath: null };
      }
      
      return { success: true, filePath: filePaths[0] };
    } catch (error) {
      console.error('[MAIN] Error selecting file:', error);
      return { success: false, error: error.message };
    }
  });
  
  // Close an MCP client
  ipcMain.handle('mcp:closeClient', async (event, { clientId }) => {
    try {
      console.log(`[MAIN] Closing MCP client: ${clientId}`);
      
      // Get the client
      const client = activeClients.get(clientId);
      if (!client) {
        return { success: true }; // Already closed or doesn't exist
      }
      
      // Close the client
      await client.close();
      
      // Remove from active clients
      activeClients.delete(clientId);
      
      return { success: true };
    } catch (error) {
      console.error(`[MAIN] Error closing MCP client ${clientId}:`, error);
      return { 
        success: false, 
        error: error.message || error.toString() 
      };
    }
  });

  // Call a tool on an MCP server
  ipcMain.handle('mcp:callTool', async (event, { clientId, toolName, arguments: toolArgs }) => {
    try {
      console.log(`[MAIN] Calling MCP tool: ${toolName} with arguments:`, toolArgs);
      
      // Validate request
      if (!clientId) {
        throw new Error('Client ID is required');
      }
      
      if (!toolName) {
        throw new Error('Tool name is required');
      }
      
      // Get the client
      const client = activeClients.get(clientId);
      if (!client) {
        throw new Error(`MCP client not found with ID: ${clientId}`);
      }
      
      // Try to call the tool using normal SDK method first
      console.log(`[MAIN] Executing tool ${toolName} using SDK method...`);
      
      try {
        // Add detailed logging
        const callPromise = client.callTool(toolName, toolArgs || {})
          .then(result => {
            console.log(`[MAIN] Tool ${toolName} raw result:`, result);
            return result;
          })
          .catch(error => {
            console.error(`[MAIN] Tool call native error:`, error);
            throw error;
          });
          
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => {
            console.error(`[MAIN] Tool call to '${toolName}' timed out after 30 seconds`);
            reject(new Error(`Tool call to '${toolName}' timed out after 30 seconds`));
          }, 30000)
        );
        
        const result = await Promise.race([callPromise, timeoutPromise]);
        console.log(`[MAIN] Tool ${toolName} executed successfully via SDK:`, result);
        
        return { 
          success: true, 
          result: result
        };
      } catch (sdkError) {
        // If the SDK method fails, try the direct JSON-RPC approach
        console.warn(`[MAIN] SDK tool call failed, trying direct JSON-RPC approach...`, sdkError);
        
        // Access the raw transport to send a manual JSON-RPC request
        const transport = client._transport;
        if (!transport || !transport.send) {
          throw new Error(`Cannot access transport for direct JSON-RPC call`);
        }
        
        // Create a direct JSON-RPC request
        const requestId = `tool-call-${Date.now()}`;
        const request = {
          jsonrpc: "2.0",
          id: requestId,
          method: "tools/call",
          params: {
            name: toolName,
            arguments: toolArgs || {}
          }
        };
        
        console.log(`[MAIN] Sending direct JSON-RPC request:`, request);
        
        // Create a Promise to wait for the response
        const directCallPromise = new Promise((resolve, reject) => {
          // Store original onMessage handler
          const originalOnMessage = transport._onMessage;
          
          // Set up a new handler to capture our specific response
          transport._onMessage = (message) => {
            try {
              const parsedMsg = JSON.parse(message);
              
              // If this is our response, resolve with it
              if (parsedMsg.id === requestId) {
                console.log(`[MAIN] Received direct JSON-RPC response:`, parsedMsg);
                
                // Restore original handler
                transport._onMessage = originalOnMessage;
                
                if (parsedMsg.error) {
                  reject(new Error(`JSON-RPC error: ${JSON.stringify(parsedMsg.error)}`));
                } else {
                  resolve(parsedMsg.result);
                }
                return;
              }
              
              // Otherwise, pass to original handler
              if (originalOnMessage) {
                originalOnMessage(message);
              }
            } catch (error) {
              console.error(`[MAIN] Error parsing message in direct JSON-RPC handler:`, error);
              
              // Always restore original handler on error
              transport._onMessage = originalOnMessage;
              
              // Call original handler with the message
              if (originalOnMessage) {
                originalOnMessage(message);
              }
            }
          };
          
          // Send the request
          transport.send(JSON.stringify(request));
        });
        
        // Set a timeout for the direct call
        const directTimeoutPromise = new Promise((_, reject) => 
          setTimeout(() => {
            console.error(`[MAIN] Direct JSON-RPC call to '${toolName}' timed out after 30 seconds`);
            reject(new Error(`Direct JSON-RPC call to '${toolName}' timed out after 30 seconds`));
          }, 30000)
        );
        
        try {
          // Race between the call and the timeout
          const directResult = await Promise.race([directCallPromise, directTimeoutPromise]);
          console.log(`[MAIN] Tool ${toolName} executed successfully via direct JSON-RPC:`, directResult);
          
          // Format the result to match what the SDK would return
          return {
            success: true,
            result: {
              content: typeof directResult === 'string' 
                ? [{ type: 'text', text: directResult }] 
                : Array.isArray(directResult) 
                  ? directResult 
                  : [{ type: 'text', text: JSON.stringify(directResult) }]
            }
          };
        } catch (directError) {
          console.error(`[MAIN] Direct JSON-RPC call failed:`, directError);
          throw directError; // Re-throw to be caught by the outer catch block
        }
      }
    } catch (error) {
      console.error(`[MAIN] Error calling MCP tool ${toolName}:`, error);
      
      // Provide helpful error messages
      let errorMessage = error.message || error.toString();
      
      if (errorMessage.includes('not found')) {
        errorMessage = `Tool '${toolName}' not found on the server. Check the tool name and server configuration.`;
      } else if (errorMessage.includes('timed out')) {
        errorMessage = `Tool call timed out. The tool execution may be taking too long or the server may be unresponsive.`;
      } else if (errorMessage.includes('invalid arguments')) {
        errorMessage = `Invalid arguments for tool '${toolName}'. Check the required parameters.`;
      }
      
      console.error(`[MAIN] Returning error for tool call: ${errorMessage}`);
      
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  });
}

// Cleanup function to close all clients on app exit
export function cleanupMCPClients() {
  for (const [clientId, client] of activeClients.entries()) {
    console.log(`[MAIN] Cleaning up MCP client: ${clientId}`);
    try {
      client.close();
    } catch (error) {
      console.error(`[MAIN] Error closing MCP client ${clientId}:`, error);
    }
  }
  activeClients.clear();
} 
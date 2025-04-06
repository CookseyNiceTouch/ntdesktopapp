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
      const mcp = new Client({ name: "nice-touch-app", version: "1.0.0" });
      
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
  
  // Call a tool on an MCP server
  ipcMain.handle('mcp:callTool', async (event, { clientId, name, args }) => {
    try {
      console.log(`[MAIN] Received tool call request for ${name}`);
      
      // Get the client
      const client = activeClients.get(clientId);
      if (!client) {
        throw new Error(`No MCP client found with ID: ${clientId}`);
      }
      
      console.log(`[MAIN] Found client with ID ${clientId}, calling tool...`);
      
      // Call the tool with timeout to prevent hanging
      const toolPromise = client.callTool({
        name,
        arguments: args,
      });
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Tool call timed out')), 30000)
      );
      
      const result = await Promise.race([toolPromise, timeoutPromise]);
      
      console.log(`[MAIN] Tool execution completed, result:`, result);
      
      return { 
        success: true, 
        result 
      };
    } catch (error) {
      console.error(`[MAIN] Error calling tool ${name}:`, error);
      return { 
        success: false, 
        error: error.message || error.toString() 
      };
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
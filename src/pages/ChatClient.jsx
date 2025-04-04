import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import '../styles/ChatClient.css';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const ChatClient = () => {
  const { currentUser, logout } = useAuth();
  const [messages, setMessages] = useState([{
    role: 'system',
    content: 'Welcome to Nice Touch AI Chat! You can chat directly or connect to an MCP server to use tools.'
  }]);
  const [inputMessage, setInputMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [serverUrl, setServerUrl] = useState('http://localhost:8080');
  const [isLoading, setIsLoading] = useState(false);
  const [availableTools, setAvailableTools] = useState([]);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const [anthropicInitialized, setAnthropicInitialized] = useState(false);
  const timeoutRef = useRef(null); // Add timeout ref for cleanup
  
  // MCP client
  const mcpClientRef = useRef(null);
  
  // Initialize Anthropic client via Electron IPC
  useEffect(() => {
    const initAnthropic = async () => {
      try {
        const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
        if (ANTHROPIC_API_KEY) {
          const result = await window.electronAnthropic.init(ANTHROPIC_API_KEY);
          if (result.success) {
            setAnthropicInitialized(true);
          } else {
            throw new Error(result.error);
          }
        } else {
          throw new Error("No Anthropic API key found in environment variables");
        }
      } catch (error) {
        console.error("Failed to initialize Anthropic:", error);
        setMessages(prev => [...prev, {
          role: 'system',
          content: `Error: ${error.message}`
        }]);
      }
    };
    
    initAnthropic();
    
    // Focus input field on initial load
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);
  
  // Connect to an MCP server using SSE
  const connectToServer = async (url) => {
    try {
      setIsLoading(true);
      
      // Add a log to verify the URL
      console.log(`Attempting to connect to MCP server at: ${url}`);
      
      // Create MCP client with SSE transport
      const mcp = new Client({ name: "nice-touch-chat", version: "1.0.0" });
      
      // Configure SSE transport with additional options
      const transport = new SSEClientTransport({
        url: url,
        // Add additional options that might help with connection issues
        withCredentials: false,
        reconnectDelay: 1000,
        timeout: 30000
      });
      
      // Log before connecting
      console.log("Initializing SSE transport connection...");
      
      // Connect and wait for connection to establish
      mcp.connect(transport);
      
      // Give the connection a moment to establish before trying commands
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log("Connection established, requesting tool list...");
      
      // List available tools
      const toolsResult = await mcp.listTools();
      const tools = toolsResult.tools.map((tool) => {
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        };
      });
      
      console.log(`Got tools: ${JSON.stringify(tools.map(t => t.name))}`);
      
      setAvailableTools(tools);
      mcpClientRef.current = mcp;
      setIsConnected(true);
      
      // Add system message about connection
      setMessages(prev => [...prev, {
        role: 'system',
        content: `Connected to server with tools: ${tools.map(t => t.name).join(', ')}`
      }]);
      
    } catch (error) {
      console.error("Failed to connect to MCP server:", error);
      
      // More detailed error message
      let errorMessage = error.message || "Unknown error";
      
      // Check for common issues
      if (errorMessage.includes("Not connected")) {
        errorMessage = "Failed to establish connection to the server. Make sure the server is running and supports SSE connections.";
      } else if (errorMessage.includes("CORS")) {
        errorMessage = "CORS error: The server doesn't allow connections from this origin. The server must have CORS headers configured.";
      } else if (errorMessage.includes("SyntaxError")) {
        errorMessage = "The server response couldn't be parsed. Check that the server implements the MCP protocol correctly.";
      }
      
      setMessages(prev => [...prev, {
        role: 'system',
        content: `Error connecting to server: ${errorMessage}`
      }]);
    } finally {
      setIsLoading(false);
      // Focus input field after connecting
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };
  
  // Process query using Anthropic without streaming
  const processQuery = async (query) => {
    if (!anthropicInitialized) {
      setMessages(prev => [...prev, {
        role: 'system',
        content: 'Error: Anthropic API not initialized'
      }]);
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Add user message to chat
      setMessages(prev => [...prev, { role: 'user', content: query }]);
      
      // Get previous conversation messages for context
      const conversationHistory = messages
        .filter(msg => msg.role === 'user' || msg.role === 'assistant')
        .slice(-4)  // Last 4 messages for context
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));
      
      // Create message request options
      const requestOptions = {
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1000,
        system: "You are a helpful AI assistant. Respond concisely and accurately to the user's questions.",
        messages: [...conversationHistory, { role: 'user', content: query }],
        stream: false, // Disable streaming
      };
      
      // Only include tools if connected to an MCP server
      if (isConnected && availableTools.length > 0) {
        requestOptions.tools = availableTools;
      }
      
      // Display "processing" message
      const processingId = `processing_${Date.now()}`;
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Processing your request...',
        id: processingId
      }]);
      
      console.log('Sending non-streaming request:', requestOptions);
      
      // Send request to Claude without streaming
      const response = await window.electronAnthropic.createMessage(requestOptions);
      
      if (!response.success) {
        throw new Error(response.error || 'Unknown error calling Anthropic API');
      }
      
      // Replace processing message with actual response
      setMessages(prev => {
        const newMessages = [...prev];
        const processingIndex = newMessages.findIndex(msg => msg.id === processingId);
        
        if (processingIndex !== -1) {
          // If there's a tool use, handle it
          if (response.data.content && response.data.content.length > 0 && 
              response.data.content[0].type === 'tool_use') {
            
            const toolUse = response.data.content[0];
            const toolName = toolUse.name;
            const toolArgs = toolUse.input || {};
            
            // Update assistant message to show tool use
            newMessages[processingIndex] = {
              role: 'assistant',
              content: `Using tool: ${toolName} with input: ${JSON.stringify(toolArgs, null, 2)}`
            };
            
            // Call the tool in the next tick
            setTimeout(() => {
              if (isConnected && mcpClientRef.current) {
                // Add tool call message
                setMessages(prev => [...prev, { 
                  role: 'system', 
                  content: `Calling tool: ${toolName} with args: ${JSON.stringify(toolArgs)}`
                }]);
                
                // Call the tool via MCP
                mcpClientRef.current.callTool({
                  name: toolName,
                  arguments: toolArgs,
                }).then(result => {
                  // Add tool result to chat
                  setMessages(prev => [...prev, { 
                    role: 'system', 
                    content: `Tool result: ${JSON.stringify(result.content)}`
                  }]);
                  
                  // Send tool result back to Claude for final response
                  const toolResultMessages = [
                    { role: 'user', content: query },
                    {
                      role: 'assistant',
                      content: [{ type: 'tool_use', name: toolName, input: toolArgs }]
                    },
                    {
                      role: 'user',
                      content: result.content,
                    }
                  ];
                  
                  // Process final response after tool call
                  window.electronAnthropic.createMessage({
                    model: "claude-3-5-sonnet-20241022",
                    max_tokens: 1000,
                    messages: toolResultMessages,
                  }).then(finalResponse => {
                    if (finalResponse.success) {
                      setMessages(prev => [...prev, { 
                        role: 'assistant', 
                        content: finalResponse.data.content[0].text
                      }]);
                    } else {
                      throw new Error(finalResponse.error || 'Error getting final response');
                    }
                  }).catch(error => {
                    console.error('Error getting final response:', error);
                    setMessages(prev => [...prev, {
                      role: 'system',
                      content: `Error getting final response: ${error.message}`
                    }]);
                  }).finally(() => {
                    setIsLoading(false);
                  });
                }).catch(error => {
                  console.error('Error calling tool:', error);
                  setMessages(prev => [...prev, {
                    role: 'system',
                    content: `Error calling tool: ${error.message}`
                  }]);
                  setIsLoading(false);
                });
              }
            }, 0);
            
            return newMessages;
          }
          
          // Normal text response
          newMessages[processingIndex] = {
            role: 'assistant',
            content: response.data.content[0].text
          };
        }
        
        return newMessages;
      });
      
      // If no tool use, we're done
      if (!response.data.content || response.data.content.length === 0 || 
          response.data.content[0].type !== 'tool_use') {
        setIsLoading(false);
      }
      
    } catch (error) {
      console.error("Error processing query:", error);
      setMessages(prev => [...prev, {
        role: 'system',
        content: `Error: ${error.message}`
      }]);
      setIsLoading(false);
    } finally {
      // Focus input field after processing
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100);
    }
  };
  
  // Handle message submission
  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputMessage.trim() === '') return;
    
    processQuery(inputMessage);
    setInputMessage('');
  };
  
  // Handle connect to server
  const handleConnect = (e) => {
    e.preventDefault();
    if (serverUrl.trim() === '') return;
    
    connectToServer(serverUrl);
  };

  // Handle logout
  const handleLogout = async () => {
    await logout();
  };
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mcpClientRef.current) {
        mcpClientRef.current.close();
      }
    };
  }, []);
  
  return (
    <div className="chat-container">
      <header className="chat-header">
        <h1>Nice Touch AI Chat</h1>
        <div className="header-controls">
          {!isConnected ? (
            <form onSubmit={handleConnect} className="server-form">
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="Enter MCP server URL (http://...)"
                className="server-input"
                disabled={isLoading}
              />
              <button 
                type="submit" 
                className="connect-button"
                disabled={isLoading}
              >
                Connect to Tools
              </button>
            </form>
          ) : (
            <div className="server-info">
              <span className="connection-status">Connected to MCP Server</span>
              <button 
                onClick={() => {
                  mcpClientRef.current?.close();
                  setIsConnected(false);
                  setAvailableTools([]);
                }}
                className="disconnect-button"
              >
                Disconnect
              </button>
            </div>
          )}
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>
      </header>
      
      <div className="messages-container">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.role}`}>
            <div className="message-header">{msg.role}</div>
            <div className="message-content">{msg.content}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
        
        {isLoading && (
          <div className="loading-indicator">
            Processing...
          </div>
        )}
      </div>
      
      <form onSubmit={handleSubmit} className="input-form">
        <input
          ref={inputRef}
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Type your message..."
          className="message-input"
          disabled={isLoading}
        />
        <button 
          type="submit" 
          className="send-button"
          disabled={isLoading}
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default ChatClient; 
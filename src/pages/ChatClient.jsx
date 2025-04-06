import React, { useState, useEffect, useRef, useReducer } from 'react';
import { useAuth } from '../context/AuthContext';
import '../styles/ChatClient.css';
import { v4 as uuidv4 } from 'uuid';
import { messageReducer, initialState } from '../reducers/messageReducer';
import ChatService from '../services/ChatService';

const ChatClient = () => {
  const { currentUser, logout } = useAuth();
  const [state, dispatch] = useReducer(messageReducer, initialState);
  const [inputMessage, setInputMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [serverPath, setServerPath] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableTools, setAvailableTools] = useState([]);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const [anthropicInitialized, setAnthropicInitialized] = useState(false);
  const timeoutRef = useRef(null);
  
  // MCP client
  const mcpClientRef = useRef(null);
  
  // Initialize ChatService
  const chatServiceRef = useRef(new ChatService(window.electronAnthropic));
  
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
        dispatch({
          type: 'ADD_USER_MESSAGE',
          payload: { role: 'system', content: `Error: ${error.message}`, id: uuidv4() }
        });
      }
    };
    
    initAnthropic();
    
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);
  
  // Connect to an MCP server using Stdio transport
  const connectToServer = async (scriptPath) => {
    try {
      setIsLoading(true);
      
      console.log(`Launching MCP server from path: ${scriptPath}`);
      
      // Generate a unique client ID
      const clientId = `mcp_client_${Date.now()}`;
      
      // Launch the server via Electron IPC
      const result = await window.electronMCP.launchServer({
        serverPath: scriptPath,
        clientId
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to launch MCP server');
      }
      
      console.log(`Server launched successfully with tools:`, result.tools);
      
      setAvailableTools(result.tools);
      setIsConnected(true);
      
      // Store client ID for later use
      mcpClientRef.current = { clientId };
      
      // Add system message about connection
      dispatch({
        type: 'ADD_USER_MESSAGE',
        payload: { role: 'system', content: `Connected to MCP server with tools: ${result.tools.map(t => t.name).join(', ')}`, id: uuidv4() }
      });
      
    } catch (error) {
      console.error("Failed to connect to MCP server:", error);
      dispatch({
        type: 'ADD_USER_MESSAGE',
        payload: { role: 'system', content: `Error connecting to server: ${error.message}`, id: uuidv4() }
      });
    } finally {
      setIsLoading(false);
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };
  
  // Call MCP tool via Electron IPC
  const callMCPTool = async (toolName, toolArgs) => {
    if (!mcpClientRef.current || !mcpClientRef.current.clientId) {
      throw new Error('No active MCP connection');
    }
    
    console.log(`[callMCPTool] Starting tool call for "${toolName}"`);
    console.log(`[callMCPTool] Client ID: ${mcpClientRef.current.clientId}`);
    console.log(`[callMCPTool] Tool args:`, toolArgs);
    
    const callOptions = {
      clientId: mcpClientRef.current.clientId,
      name: toolName,
      args: toolArgs
    };
    
    console.log(`[callMCPTool] Sending request:`, JSON.stringify(callOptions, null, 2));
    
    const result = await window.electronMCP.callTool(callOptions);
    
    console.log(`[callMCPTool] Received response:`, JSON.stringify(result, null, 2));
    
    if (!result.success) {
      console.error(`[callMCPTool] Error:`, result.error);
      throw new Error(result.error || 'Tool execution failed');
    }
    
    console.log(`[callMCPTool] Success, returning result data`);
    return result.result;
  };
  
  // Process query using Anthropic without streaming (modified for Stdio transport)
  const processQuery = async (query) => {
    if (!anthropicInitialized) {
      dispatch({
        type: 'ADD_USER_MESSAGE',
        payload: { role: 'system', content: 'Error: Anthropic API not initialized', id: uuidv4() }
      });
      return;
    }
    
    let processingId = null; // Declare processingId earlier
    
    try {
      setIsLoading(true);
      
      // Add user message to chat
      dispatch({
        type: 'ADD_USER_MESSAGE',
        payload: { role: 'user', content: [{type: 'text', text: query}], id: uuidv4() }
      });
      
      // Get previous conversation messages for context
      const conversationHistory = state.messages
        .filter(msg => msg.role === 'user' || msg.role === 'assistant')
        .slice(-4)
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
        stream: false,
      };
      
      // Only include tools if connected to an MCP server
      if (isConnected && availableTools.length > 0) {
        requestOptions.tools = availableTools;
        // Add detailed log for the tools structure
        console.log('Adding tools to request. availableTools:', JSON.stringify(availableTools, null, 2)); 
      }
      
      // Updated log to stringify the whole request for better visibility
      console.log('Sending non-streaming request:', JSON.stringify(requestOptions, null, 2)); 
      
      // Send request to Claude without streaming
      const response = await window.electronAnthropic.createMessage(requestOptions);
      
      // Add more detailed logging for the initial response
      console.log('Initial Claude response full data:', response);
      
      if (!response.success) {
        throw new Error(response.error || 'Unknown error calling Anthropic API');
      }
      
      // Log the content structure to verify we have what we expect
      console.log('Response content array:', response.data.content);
      console.log('First content item type:', response.data.content && response.data.content.length > 0 ? response.data.content[0].type : 'none');
      
      // Replace original processing message with actual response
      // Ensure processingId exists and content is handled safely
      if (processingId) {
        dispatch({
          type: 'COMPLETE_RESPONSE',
          payload: {
            id: processingId, // Use the ID from the original "Processing..." message
            role: 'assistant',
            // Safely access text content, provide fallback if needed
            content: (response.data.content && response.data.content.length > 0 && response.data.content[0].type === 'text') 
                      ? response.data.content[0].text 
                      : "(No text content received)" // Fallback content
          }
        });
      } else {
        console.error("Processing ID was lost before completing response!");
      }
      
      // Verbose logging for tool calls check
      console.log('Checking for tool calls:', {
        hasContent: !!response.data.content,
        contentLength: response.data.content ? response.data.content.length : 0,
        firstItemType: response.data.content && response.data.content.length > 0 ? response.data.content[0].type : 'none',
        hasTool_calls: !!response.data.tool_calls,
        tool_callsLength: response.data.tool_calls ? response.data.tool_calls.length : 0,
      });
      
      // Check for tool_calls in the response (Anthropic's actual format)
      if (response.data.tool_calls && response.data.tool_calls.length > 0) {
        
        console.log('*** TOOL CALLS DETECTED - Starting tool execution flow ***');
        
        try {
          // Extract tool information from Claude's response
          const toolCall = response.data.tool_calls[0];
          console.log('Tool call object:', JSON.stringify(toolCall, null, 2));
          
          // Get proper tool name and arguments from the response
          const toolName = toolCall.function.name;
          let toolArgs = {};
          
          console.log('Extracting tool arguments. Raw args:', toolCall.function.arguments);
          console.log('Tool args type:', typeof toolCall.function.arguments);
          
          try {
            // Normalize arguments - ensure valid JSON
            if (typeof toolCall.function.arguments === 'string') {
              if (toolCall.function.arguments.trim() === '') {
                // Handle empty string case
                console.log('Empty arguments string, using empty object');
                toolArgs = {};
              } else {
                // Parse non-empty string
                console.log('Parsing string arguments as JSON');
                toolArgs = JSON.parse(toolCall.function.arguments);
              }
            } else if (typeof toolCall.function.arguments === 'object') {
              // If it's already an object, use it directly
              console.log('Using arguments as object directly');
              toolArgs = toolCall.function.arguments;
            }
            console.log('Parsed tool arguments:', toolArgs);
          } catch (err) {
            console.error('Error parsing tool arguments:', err);
            // Fall back to empty object if parsing fails
            console.log('Parsing failed, using empty object');
            toolArgs = {};
          }
          
          // Add a message showing the tool being used
          console.log('Dispatching TOOL_USE action');
          const toolUseId = uuidv4();
          dispatch({
            type: 'TOOL_USE',
            payload: { 
              id: toolUseId,
              name: toolName,
              input: toolArgs
            }
          });
          
          // Call the MCP tool
          console.log(`Calling MCP tool "${toolName}" with args:`, toolArgs);
          const toolResult = await callMCPTool(toolName, toolArgs);
          console.log('Tool result received:', JSON.stringify(toolResult, null, 2));
          
          // Add tool result to the messages
          console.log('Dispatching TOOL_RESPONSE action');
          const toolResultId = uuidv4();
          dispatch({
            type: 'TOOL_RESPONSE',
            payload: { 
              id: toolResultId,
              name: toolName,
              content: `Result: ${JSON.stringify(toolResult, null, 2)}`
            }
          });
          
          // Prepare a new request to get final response with tool result
          // Use the same tool call ID that came in the response
          const toolCallId = toolCall.id;
          console.log('Building final request with tool result');
          const finalRequestOptions = {
            model: "claude-3-5-haiku-20241022",
            max_tokens: 1000,
            system: "You are a helpful AI assistant. Respond concisely and accurately to the user's questions.",
            messages: [
              // Previous conversation context (excluding the last user message)
              ...conversationHistory.slice(0, -1),
              
              // The user's query (most recent)
              { role: 'user', content: query },
              
              // Assistant message with tool call - minimal content as recommended
              { 
                role: 'assistant', 
                content: "", // Empty content to avoid confusion
                tool_calls: [
                  {
                    id: toolCallId,
                    type: "function",
                    function: {
                      name: toolName,
                      arguments: typeof toolArgs === 'object' ? 
                                JSON.stringify(toolArgs) : 
                                (toolArgs || "{}")
                    }
                  }
                ]
              },
              
              // Tool response with matching tool_call_id
              { 
                role: 'tool', 
                tool_call_id: toolCallId,
                name: toolName,
                content: typeof toolResult === 'string' ? 
                          toolResult : 
                          JSON.stringify(toolResult)
              }
            ],
            stream: false,
          };
          
          console.log('Final request options:', JSON.stringify(finalRequestOptions, null, 2));
          
          // Send the final request
          console.log('Dispatching START_THINKING action');
          const finalProcessingId = uuidv4();
          dispatch({
            type: 'START_THINKING',
            payload: { 
              id: finalProcessingId,
              text: 'Processing tool result...'
            }
          });
          
          console.log('Sending final request to Claude');
          const finalResponse = await window.electronAnthropic.createMessage(finalRequestOptions);
          console.log('Final response received:', finalResponse);
          
          if (!finalResponse.success) {
            console.error('Final response error:', finalResponse.error);
            throw new Error(finalResponse.error || 'Unknown error getting final response');
          }
          
          // Show the final response
          console.log('Dispatching FINAL_RESPONSE action');
          dispatch({
            type: 'FINAL_RESPONSE',
            payload: {
              id: uuidv4(), // Use a new ID since we don't want to replace the processing message
              role: 'assistant',
              content: finalResponse.data.content[0].text
            }
          });
          console.log('*** TOOL FLOW COMPLETED SUCCESSFULLY ***');
        } catch (error) {
          console.error("Error processing tool:", error);
          console.error("Error stack:", error.stack);
          dispatch({
            type: 'ADD_USER_MESSAGE',
            payload: { 
              role: 'system', 
              content: `Error processing tool: ${error.message}`, 
              id: uuidv4() 
            }
          });
        }
      } else {
        console.log('No tool_calls detected in response');
      }
      
      // We'll always set isLoading to false here regardless of tool use,
      // since we handle setting it for both cases now
      setIsLoading(false);
      
    } catch (error) {
      console.error("Error processing query:", error);
      dispatch({
        type: 'ADD_USER_MESSAGE',
        payload: { role: 'system', content: `Error: ${error.message}`, id: uuidv4() }
      });
      setIsLoading(false);
    } finally {
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
    if (serverPath.trim() === '') return;
    
    connectToServer(serverPath);
  };

  // Handle logout
  const handleLogout = async () => {
    await logout();
  };
  
  // Handle file selection
  const handleFileSelect = async () => {
    try {
      const result = await window.electronMCP.selectServerFile();
      if (result.success && result.filePath) {
        setServerPath(result.filePath);
      }
    } catch (error) {
      console.error("Error selecting file:", error);
    }
  };
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mcpClientRef.current && mcpClientRef.current.clientId) {
        window.electronMCP.closeClient({ clientId: mcpClientRef.current.clientId });
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
              <div className="file-input-container">
                <input
                  type="text"
                  value={serverPath}
                  onChange={(e) => setServerPath(e.target.value)}
                  placeholder="Enter path to MCP server script (.js or .py)"
                  className="server-input"
                  disabled={isLoading}
                />
                <button 
                  type="button"
                  onClick={handleFileSelect}
                  className="browse-button"
                  disabled={isLoading}
                >
                  Browse
                </button>
              </div>
              <button 
                type="submit" 
                className="connect-button"
                disabled={isLoading}
              >
                Launch Server
              </button>
            </form>
          ) : (
            <div className="server-info">
              <span className="connection-status">Connected to MCP Server</span>
              <button 
                onClick={() => {
                  if (mcpClientRef.current && mcpClientRef.current.clientId) {
                    window.electronMCP.closeClient({ clientId: mcpClientRef.current.clientId });
                  }
                  setIsConnected(false);
                  setAvailableTools([]);
                  mcpClientRef.current = null;
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
        {state.messages.map((msg, index) => (
          <div key={index} className={`message ${msg.role}`}>
            <div className="message-header">{msg.role}</div>
            <div className="message-content">
              {(() => {
                try {
                  if (typeof msg.content === 'string') {
                    return msg.content;
                  } else if (Array.isArray(msg.content)) {
                    return msg.content.map((item, i) => {
                      if (item.type === 'text') {
                        return <div key={i} className="text-block">{item.text}</div>
                      } else if (item.type === 'thinking') {
                        return <div key={i} className="thinking-block">{item.text}</div>
                      } else {
                        return <div key={i}>{JSON.stringify(item, null, 2)}</div>
                      }
                    });
                  } else {
                    return JSON.stringify(msg.content, null, 2);
                  }
                } catch (err) {
                  return `[Error displaying content: ${err.message}]`;
                }
              })()}
            </div>
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
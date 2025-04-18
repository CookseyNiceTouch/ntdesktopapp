import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import '../styles/ChatClient.css';
import { v4 as uuidv4 } from 'uuid';

const ChatClient = () => {
  const { currentUser, logout } = useAuth();
  // Replace reducer with useState for messages
  const [messages, setMessages] = useState([{
    role: 'system',
    content: 'Welcome to Nice Touch AI Chat! You can chat directly or connect to an MCP server to use tools.',
    id: 'welcome-msg'
  }]);
  const [inputMessage, setInputMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [serverPath, setServerPath] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableTools, setAvailableTools] = useState([]);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const [anthropicInitialized, setAnthropicInitialized] = useState(false);
  
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
        addMessage({
          role: 'system',
          content: `Error: ${error.message}`,
          id: uuidv4()
        });
      }
    };
    
    initAnthropic();
    
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);
  
  // Helper function to add messages
  const addMessage = (message) => {
    setMessages(prevMessages => [...prevMessages, message]);
  };
  
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
      addMessage({
        role: 'system',
        content: `Connected to MCP server with tools: ${result.tools.map(t => t.name).join(', ')}`,
        id: uuidv4()
      });
      
    } catch (error) {
      console.error("Failed to connect to MCP server:", error);
      addMessage({
        role: 'system',
        content: `Error connecting to server: ${error.message}`,
        id: uuidv4()
      });
    } finally {
      setIsLoading(false);
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };
  
  // Helper function to process tool calls from Anthropic
  const processToolCall = async (toolCall) => {
    try {
      if (!isConnected || !mcpClientRef.current || !mcpClientRef.current.clientId) {
        throw new Error('No active MCP connection. Please connect to an MCP server first.');
      }
      
      console.log('Processing tool call:', toolCall);
      
      // Extract tool info
      const toolName = toolCall.name;
      const toolArgs = toolCall.arguments || {};
      const toolId = toolCall.id || `tool_${Date.now()}`;
      
      // Add "tool calling" message
      addMessage({
        role: 'tool',
        content: `Calling tool: ${toolName} with arguments: ${JSON.stringify(toolArgs, null, 2)}`,
        id: uuidv4()
      });
      
      try {
        // Call the tool via the MCP client
        const result = await window.electronMCP.callTool({
          clientId: mcpClientRef.current.clientId,
          toolName: toolName,
          arguments: toolArgs
        });
        
        console.log('Tool call result:', result);
        
        let toolResponse;
        
        if (!result.success) {
          throw new Error(result.error || 'Unknown error calling tool');
        }
        
        // Format response based on the result structure
        if (result.result && result.result.content) {
          // Handle array of content blocks (standard MCP response)
          if (Array.isArray(result.result.content)) {
            // Find the first text block
            const textBlock = result.result.content.find(item => item.type === 'text');
            if (textBlock) {
              // If we have a text block, use it directly
              toolResponse = textBlock.text;
            } else {
              // Otherwise stringify the content
              toolResponse = JSON.stringify(result.result.content);
            }
          } else {
            // Handle non-array content
            toolResponse = typeof result.result.content === 'string' ? 
              result.result.content : JSON.stringify(result.result.content);
          }
        } else if (typeof result.result === 'string') {
          // Handle string response
          toolResponse = result.result;
        } else {
          // Handle JSON response - stringify it
          toolResponse = JSON.stringify(result.result);
        }
        
        console.log('Normalized tool response:', toolResponse);
        
        // Add tool response message
        addMessage({
          role: 'tool',
          name: toolName,
          content: toolResponse,
          id: uuidv4(),
          toolId: toolId
        });
        
        return {
          success: true,
          toolName: toolName,
          toolId: toolId,
          content: toolResponse
        };
      } catch (error) {
        console.error('Error processing tool call:', error);
        
        // Create an error response
        const errorResponse = `Error: ${error.message}`;
        
        console.log('Error response:', errorResponse);
        
        // Add error message as a tool message
        addMessage({
          role: 'tool',
          name: toolName,
          content: errorResponse,
          id: uuidv4(),
          toolId: toolId,
          error: true
        });
        
        return {
          success: false,
          toolName: toolName,
          toolId: toolId,
          content: errorResponse,
          error: error.message
        };
      }
    } catch (error) {
      console.error('Error setting up tool call:', error);
      
      // Add system error message
      addMessage({
        role: 'system',
        content: `Error: ${error.message}`,
        id: uuidv4()
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  };
  
  // Process query using Anthropic without streaming
  const processQuery = async (query) => {
    if (!anthropicInitialized) {
      addMessage({
        role: 'system',
        content: 'Error: Anthropic API not initialized',
        id: uuidv4()
      });
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Add user message to chat
      addMessage({
        role: 'user',
        content: query,
        id: uuidv4()
      });
      
      // Get previous conversation messages for context
      const conversationHistory = messages
        .filter(msg => msg.role === 'user' || msg.role === 'assistant' || msg.role === 'tool')
        .slice(-6)
        .map(msg => {
          // Handle different message role types
          if (msg.role === 'user' || msg.role === 'assistant') {
            return {
              role: msg.role,
              content: typeof msg.content === 'string' ? msg.content : 
                     Array.isArray(msg.content) ? 
                       msg.content.map(item => item.type === 'text' ? item.text : JSON.stringify(item)).join(' ') : 
                       JSON.stringify(msg.content)
            };
          } else if (msg.role === 'tool') {
            // For tool messages, use the proper format
            return {
              role: 'assistant',
              content: [
                {
                  type: 'tool_result',
                  tool_name: msg.name || 'unknown',
                  tool_result: Array.isArray(msg.content) 
                    ? msg.content.find(c => c.type === 'text')?.text || JSON.stringify(msg.content)
                    : typeof msg.content === 'string' 
                      ? msg.content 
                      : JSON.stringify(msg.content)
                }
              ]
            };
          }
        })
        .filter(Boolean);
      
      // Create system message with available tools if connected to server
      let systemMessage = "You are a helpful AI assistant. Respond concisely and accurately to the user's questions.";
      
      // Add tool descriptions if connected
      if (isConnected && availableTools.length > 0) {
        systemMessage += "\n\nYou have access to the following tools:";
        availableTools.forEach(tool => {
          systemMessage += `\n- ${tool.name}: ${tool.description}`;
        });
        systemMessage += "\n\nUse these tools when appropriate to help the user.";
      }
      
      // Create message request options
      const requestOptions = {
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1000,
        system: systemMessage,
        messages: [...conversationHistory, { role: 'user', content: query }],
        stream: false,
        // Add tool configuration if connected
        ...(isConnected && availableTools.length > 0 ? {
          tools: availableTools.map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.input_schema
          }))
        } : {})
      };
      
      console.log('Sending request:', JSON.stringify(requestOptions, null, 2)); 
      
      // Send request to Claude without streaming
      const response = await window.electronAnthropic.createMessage(requestOptions);
      
      console.log('Claude response:', response);
      
      if (!response.success) {
        throw new Error(response.error || 'Unknown error calling Anthropic API');
      }
      
      // Process tool calls if any
      if (
        response.data.content && 
        response.data.content.length > 0 && 
        response.data.content.some(item => item.type === 'tool_use')
      ) {
        // Extract tool calls
        const toolCalls = response.data.content
          .filter(item => item.type === 'tool_use')
          .map(item => ({
            name: item.name,
            arguments: item.input,
            id: item.id
          }));
        
        console.log('Found tool calls in response:', toolCalls);
        
        // Add assistant message with tool calls
        const assistantMsgId = uuidv4();
        addMessage({
          id: assistantMsgId,
          role: 'assistant',
          content: response.data.content
        });
        
        // Process each tool call and collect results
        const toolResults = [];
        console.log(`Processing ${toolCalls.length} tool calls...`);
        for (const toolCall of toolCalls) {
          console.log(`Processing tool call: ${toolCall.name} with ID: ${toolCall.id}`);
          const result = await processToolCall(toolCall);
          console.log(`Tool call result for ${toolCall.name}:`, result);
          toolResults.push(result);
        }
        
        console.log(`All ${toolResults.length} tool calls completed`);
        
        // Create follow-up message with proper tool_result blocks
        const followUpMessages = [
          ...conversationHistory,
          { role: 'user', content: query },
          { 
            role: 'assistant',
            content: response.data.content
          }
        ];
        
        // Add each tool result with proper formatting
        toolResults.forEach(result => {
          // Log the raw result structure to debug
          console.log('Raw tool result structure:', JSON.stringify(result, null, 2));
          
          // Extract the actual content to avoid extra nesting
          let actualResult;
          if (result.error) {
            // For error responses, use the error message directly
            actualResult = result.error;
          } else if (Array.isArray(result.content)) {
            // Get the text content from the first text block if available
            const textBlock = result.content.find(c => c.type === 'text');
            actualResult = textBlock ? textBlock.text : JSON.stringify(result.content);
          } else if (typeof result.content === 'string') {
            actualResult = result.content;
          } else {
            actualResult = JSON.stringify(result.content);
          }
          
          console.log('Formatted tool result:', {
            toolId: result.toolId,
            actualResult,
            actualResultType: typeof actualResult
          });
          
          // Create the tool result message with the direct string
          const toolResultMessage = {
            role: 'assistant',
            content: [
              {
                type: 'tool_result',
                tool_use_id: result.toolId,
                tool_result: actualResult
              }
            ]
          };
          
          // Log the exact message we're adding to verify structure
          console.log('Tool result message structure:', JSON.stringify(toolResultMessage, null, 2));
          
          followUpMessages.push(toolResultMessage);
        });
        
        // Log full message contents for debugging
        console.log('Follow-up messages structure:', JSON.stringify(followUpMessages, null, 2));
        
        // Final validation to ensure no nested tool_result objects
        followUpMessages.forEach(msg => {
          if (msg.role === 'assistant' && Array.isArray(msg.content)) {
            msg.content.forEach(contentItem => {
              if (contentItem.type === 'tool_result') {
                // Check for nested objects in tool_result
                if (typeof contentItem.tool_result === 'object' && contentItem.tool_result !== null) {
                  console.warn('Found nested object in tool_result, flattening:', contentItem.tool_result);
                  
                  // If tool_result is an object, stringify it
                  contentItem.tool_result = JSON.stringify(contentItem.tool_result);
                }
                
                // Verify the tool_result is a primitive type (string, number, boolean)
                console.log(`Validated tool_result (${typeof contentItem.tool_result}):`, contentItem.tool_result);
              }
            });
          }
        });
        
        // Create follow-up message
        const followUpOptions = {
          model: "claude-3-5-haiku-20241022",
          max_tokens: 1000,
          system: systemMessage,
          messages: followUpMessages,
          stream: false,
          // Include tools in follow-up
          ...(isConnected && availableTools.length > 0 ? {
            tools: availableTools.map(tool => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.input_schema
            }))
          } : {})
        };
        
        // Log full message contents for debugging
        console.log('Follow-up messages structure:', JSON.stringify(followUpMessages, null, 2));
        console.log('Sending follow-up request:', JSON.stringify(followUpOptions, null, 2));
        
        // Send follow-up request to Claude
        const followUpResponse = await window.electronAnthropic.createMessage(followUpOptions);
        
        if (!followUpResponse.success) {
          throw new Error(followUpResponse.error || 'Unknown error in follow-up response');
        }
        
        // Add follow-up response
        addMessage({
          id: uuidv4(),
          role: 'assistant',
          content: followUpResponse.data.content && followUpResponse.data.content.length > 0
            ? followUpResponse.data.content
            : "(No text content received in follow-up)"
        });
        
      } else {
        // Regular text response (no tool calls)
        addMessage({
          id: uuidv4(),
          role: 'assistant',
          content: (response.data.content && response.data.content.length > 0) 
                    ? response.data.content
                    : "(No text content received)"
        });
      }
      
    } catch (error) {
      console.error("Error processing query:", error);
      addMessage({
        role: 'system',
        content: `Error: ${error.message}`,
        id: uuidv4()
      });
    } finally {
      setIsLoading(false);
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
  }, [messages]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mcpClientRef.current && mcpClientRef.current.clientId) {
        window.electronMCP.closeClient({ clientId: mcpClientRef.current.clientId });
      }
    };
  }, []);

  // Render message content
  const renderMessageContent = (content) => {
    try {
      if (typeof content === 'string') {
        return content;
      } else if (Array.isArray(content)) {
        return content.map((item, i) => {
          if (item.type === 'text') {
            return <div key={i} className="text-block">{item.text}</div>
          } else if (item.type === 'image') {
            return <img key={i} src={item.url} alt={item.alt || 'Image'} className="image-block" />
          } else if (item.type === 'tool_use') {
            return (
              <div key={i} className="tool-call-block">
                <div className="tool-call-header">
                  <span className="tool-name">{item.name}</span>
                  <span className="tool-call-label">Tool Call</span>
                </div>
                <pre className="tool-arguments">{JSON.stringify(item.input, null, 2)}</pre>
              </div>
            );
          } else if (item.type === 'tool_result') {
            return (
              <div key={i} className="tool-result-block">
                <div className="tool-result-header">
                  <span className="tool-name">{item.tool_name}</span>
                  <span className="tool-result-label">Tool Result</span>
                </div>
                <pre className="tool-result">{typeof item.tool_result === 'string' 
                  ? item.tool_result 
                  : JSON.stringify(item.tool_result, null, 2)}</pre>
              </div>
            );
          } else {
            // For other types of content, just stringify it
            return <pre key={i} className="json-block">{JSON.stringify(item, null, 2)}</pre>
          }
        });
      } else {
        // For non-string, non-array content, stringify as JSON
        return <pre className="json-block">{JSON.stringify(content, null, 2)}</pre>
      }
    } catch (error) {
      console.error("Error rendering message content:", error);
      return <div className="error-block">Error displaying content: {error.message}</div>
    }
  };
  
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
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.role}`}>
            <div className="message-header">{msg.role}</div>
            <div className="message-content">
              {renderMessageContent(msg.content)}
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
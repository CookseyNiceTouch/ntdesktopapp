import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import '../styles/ChatClient.css';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';

const ChatClient = () => {
  const { currentUser, logout } = useAuth();
  const [messages, setMessages] = useState([{
    role: 'system',
    content: 'Welcome to Nice Touch AI Chat! You can chat directly or connect to an MCP server to use tools.'
  }]);
  const [inputMessage, setInputMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [serverUrl, setServerUrl] = useState('ws://localhost:8080');
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
  
  // Connect to an MCP server
  const connectToServer = async (url) => {
    try {
      setIsLoading(true);
      
      // Create MCP client with WebSocket transport
      const mcp = new Client({ name: "nice-touch-chat", version: "1.0.0" });
      const transport = new WebSocketClientTransport({
        url: url,
      });
      
      mcp.connect(transport);
      
      // List available tools
      const toolsResult = await mcp.listTools();
      const tools = toolsResult.tools.map((tool) => {
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        };
      });
      
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
      setMessages(prev => [...prev, {
        role: 'system',
        content: `Error connecting to server: ${error.message}`
      }]);
    } finally {
      setIsLoading(false);
      // Focus input field after connecting
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };
  
  // Process query using Anthropic and handle tool calls
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
      
      // Format conversation for Claude
      const messageHistory = [
        { role: 'user', content: query }
      ];
      
      // Get response from Claude (with tools if connected to server)
      const requestOptions = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        messages: messageHistory,
      };
      
      // Only include tools if connected to an MCP server
      if (isConnected && availableTools.length > 0) {
        requestOptions.tools = availableTools;
      }
      
      // Use IPC to create message via main process
      const result = await window.electronAnthropic.createMessage(requestOptions);
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      const response = result.data;
      
      // Process response content
      for (const content of response.content) {
        if (content.type === 'text') {
          // Add assistant message to chat
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: content.text 
          }]);
        } else if (content.type === 'tool_use' && isConnected && mcpClientRef.current) {
          const toolName = content.name;
          const toolArgs = content.input || {};
          
          // Add tool call message
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: `Calling tool: ${toolName} with args: ${JSON.stringify(toolArgs)}`
          }]);
          
          // Call the tool via MCP
          const result = await mcpClientRef.current.callTool({
            name: toolName,
            arguments: toolArgs,
          });
          
          // Add tool result to chat
          setMessages(prev => [...prev, { 
            role: 'system', 
            content: `Tool result: ${JSON.stringify(result.content)}`
          }]);
          
          // Send tool result back to Claude for final response
          messageHistory.push({
            role: 'assistant',
            content: [{ type: 'tool_use', name: toolName, input: toolArgs }]
          });
          
          messageHistory.push({
            role: 'user',
            content: result.content,
          });
          
          // Use IPC for the final response too
          const finalResult = await window.electronAnthropic.createMessage({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 1000,
            messages: messageHistory,
          });
          
          if (!finalResult.success) {
            throw new Error(finalResult.error);
          }
          
          const finalResponse = finalResult.data;
          
          // Add final response to chat
          if (finalResponse.content[0]?.type === 'text') {
            setMessages(prev => [...prev, { 
              role: 'assistant', 
              content: finalResponse.content[0].text 
            }]);
          }
        }
      }
    } catch (error) {
      console.error("Error processing query:", error);
      setMessages(prev => [...prev, {
        role: 'system',
        content: `Error: ${error.message}`
      }]);
    } finally {
      setIsLoading(false);
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
                placeholder="Enter MCP server URL (ws://...)"
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
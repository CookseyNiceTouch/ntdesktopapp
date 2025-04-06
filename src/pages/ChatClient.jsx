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
        .filter(msg => msg.role === 'user' || msg.role === 'assistant')
        .slice(-4)
        .map(msg => ({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : 
                 Array.isArray(msg.content) ? 
                   msg.content.map(item => item.type === 'text' ? item.text : JSON.stringify(item)).join(' ') : 
                   JSON.stringify(msg.content)
        }));
      
      // Create message request options
      const requestOptions = {
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1000,
        system: "You are a helpful AI assistant. Respond concisely and accurately to the user's questions.",
        messages: [...conversationHistory, { role: 'user', content: query }],
        stream: false,
      };
      
      console.log('Sending request:', JSON.stringify(requestOptions, null, 2)); 
      
      // Send request to Claude without streaming
      const response = await window.electronAnthropic.createMessage(requestOptions);
      
      console.log('Claude response:', response);
      
      if (!response.success) {
        throw new Error(response.error || 'Unknown error calling Anthropic API');
      }
      
      // Add assistant response to chat
      addMessage({
        id: uuidv4(),
        role: 'assistant',
        content: (response.data.content && response.data.content.length > 0) 
                  ? response.data.content[0].text 
                  : "(No text content received)"
      });
      
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
          } else {
            return <div key={i}>{JSON.stringify(item, null, 2)}</div>
          }
        });
      } else {
        return JSON.stringify(content, null, 2);
      }
    } catch (err) {
      return `[Error displaying content: ${err.message}]`;
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
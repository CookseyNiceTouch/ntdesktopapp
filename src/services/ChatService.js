import { v4 as uuidv4 } from 'uuid';

export default class ChatService {
  constructor(anthropicClient) {
    this.anthropicClient = anthropicClient;
    this.messageHandlers = new Map();
  }

  // Process messages with support for different content types
  async processMessage(message, conversationContext, toolProvider) {
    const messageId = uuidv4();
    
    try {
      // Format messages for API
      const messages = conversationContext.history.map(msg => {
        // Convert array content to proper format for Claude API
        if (Array.isArray(msg.content)) {
          return {
            role: msg.role,
            content: msg.content.map(item => {
              if (item.type === 'text') {
                return item.text;
              }
              return item;
            }).join(' ')
          };
        }
        
        // Handle string content
        return {
          role: msg.role,
          content: msg.content
        };
      });
      
      // Create message request options
      const requestOptions = {
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1000,
        system: "You are a helpful AI assistant. Respond concisely and accurately to the user's questions.",
        messages: [...messages, { role: 'user', content: message }],
        stream: false,
      };
      
      // Add tools if available
      if (toolProvider && toolProvider.tools && toolProvider.tools.length > 0) {
        requestOptions.tools = toolProvider.tools;
      }
      
      // Send request to Claude
      const response = await this.anthropicClient.createMessage(requestOptions);
      
      if (!response.success) {
        throw new Error(response.error || 'Unknown error calling Anthropic API');
      }
      
      // Extract and return response
      return {
        id: messageId,
        role: 'assistant',
        content: [{
          type: 'text',
          text: response.data.content[0].text
        }]
      };
      
    } catch (error) {
      console.error("Error in ChatService:", error);
      throw error;
    }
  }
  
  // Other methods for message management
} 
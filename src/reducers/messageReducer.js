export const initialState = {
  messages: [{
    role: 'system',
    content: 'Welcome to Nice Touch AI Chat! You can chat directly or connect to an MCP server to use tools.',
    id: 'welcome-msg'
  }],
  isProcessing: false,
  error: null,
};

export function messageReducer(state, action) {
  console.log(`[REDUCER] Processing action: ${action.type}`, action.payload);
  
  switch (action.type) {
    case 'ADD_USER_MESSAGE':
      console.log('[REDUCER] Adding user message');
      return {...state, messages: [...state.messages, action.payload]};
    case 'START_THINKING':
      console.log('[REDUCER] Starting thinking state');
      return {...state, isProcessing: true, messages: [...state.messages, {
        id: action.payload.id,
        role: 'assistant',
        content: [{type: 'thinking', text: 'Thinking...'}],
        status: 'thinking'
      }]};
    case 'UPDATE_THINKING':
      console.log('[REDUCER] Updating thinking state');
      return {
        ...state,
        messages: state.messages.map(msg => 
          msg.id === action.payload.id 
            ? {...msg, content: [...msg.content, {type: 'thinking', text: action.payload.text}]}
            : msg
        )
      };
    case 'COMPLETE_RESPONSE':
      console.log('[REDUCER] Completing response');
      return {
        ...state,
        isProcessing: false,
        messages: state.messages.map(msg => 
          msg.id === action.payload.id 
            ? {...action.payload, status: 'complete'}
            : msg
        )
      };
    case 'TOOL_USE':
      console.log('[REDUCER] Adding tool use message');
      return {
        ...state,
        messages: [...state.messages, {
          id: action.payload.id,
          role: 'assistant',
          content: `Using tool: ${action.payload.name}`,
          status: 'tool_use'
        }]
      };
    case 'TOOL_RESPONSE':
      console.log('[REDUCER] Adding tool response message');
      return {
        ...state,
        messages: [...state.messages, {
          id: action.payload.id,
          role: 'tool',
          content: action.payload.content,
          status: 'complete'
        }]
      };
    case 'FINAL_RESPONSE':
      console.log('[REDUCER] Adding final response message');
      return {
        ...state,
        isProcessing: false,
        messages: [...state.messages, {
          id: action.payload.id,
          role: 'assistant',
          content: action.payload.content,
          status: 'complete'
        }]
      };
    case 'SET_ERROR':
      console.log('[REDUCER] Setting error');
      return {
        ...state, 
        isProcessing: false,
        error: action.payload,
        messages: [...state.messages, {
          role: 'system',
          content: `Error: ${action.payload}`,
          id: `error-${Date.now()}`
        }]
      };
    // Other cases for tool use, content blocks, etc.
    default:
      console.log('[REDUCER] Unknown action type:', action.type);
      return state;
  }
} 
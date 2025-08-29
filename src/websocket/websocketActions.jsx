import { WebSocketClient } from './websocketHandler';
import {
  ConnectPayload,
  StartConversationPayload,
  ReadyToAdvancePayload,
  EndConversationPayload,
  SendMessagePayload,
  FetchChatHistoryPayload,
  FetchUserMetadataPayload,
  SyncConversationPayload,
  TypingStatusPayload,
  PresenceStatusPayload
} from './websocketTypes';


export const createWebSocketActions = (wsClient) => ({
  connect: async () => {
    try {
      console.log('WebSocket actions: connect() called');
      console.log('WebSocket actions: wsClient available:', !!wsClient);
      console.log('WebSocket actions: Calling wsClient.connect()...');
      
      await wsClient.connect();
      console.log('WebSocket actions: wsClient.connect() completed');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log('WebSocket actions: Waited 100ms, now sending connect action...');
      
      await wsClient.send({ action: 'connect', data: {} });
      console.log('WebSocket actions: connect action sent successfully');
    } catch (error) {
      console.error('Failed to establish WebSocket connection or update connection ID:', error);
      throw error;
    }
  },

  sendReadyToAdvance: async (payload) => {
    await wsClient.send({ action: 'setReady', data: payload });
  },

  endConversation: async (payload) => {
    await wsClient.send({ action: 'endConversation', data: payload });
  },

  sendMessage: async (payload) => {
    await wsClient.send({ action: 'sendMessage', data: payload });
  },

  startConversation: async (payload) => {
    await wsClient.send({ action: 'startConversation', data: payload });
  },

  fetchChatHistory: async (payload) => {
    await wsClient.send({ action: 'fetchChatHistory', data: payload });
  },

  getCurrentState: async (payload) => {
    console.log('WebSocket actions: getCurrentState() called with payload:', payload);
    console.log('WebSocket actions: wsClient available:', !!wsClient);
    console.log('WebSocket actions: Sending getCurrentState action...');
    
    await wsClient.send({ action: 'getCurrentState', data: payload });
    
    console.log('WebSocket actions: getCurrentState action sent successfully');
  },

  syncConversation: async (payload) => {
    await wsClient.send({ action: 'syncConversation', data: payload });
  },

  /**
   * @deprecated No-op function for API compatibility.
   */
  sendTypingStatus: async (payload) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn('sendTypingStatus WebSocket action is deprecated and has been disabled.');
    }

    return Promise.resolve();
  },

  updatePresence: async (payload) => {
    await wsClient.send({ action: 'updatePresence', data: payload });
  },

  setReady: async (payload) => {
    await wsClient.send({ action: 'setReady', data: payload });
  },

  disconnect: () => {
    wsClient.disconnect();
  }
});

export const WebSocketActions = createWebSocketActions; 
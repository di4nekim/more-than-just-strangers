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

/**
 * @typedef {Object} WebSocketActions
 * @property {function(ReadyToAdvancePayload): void} sendReadyToAdvance
 * @property {function(EndConversationPayload): void} endConversation
 * @property {function(SendMessagePayload): void} sendMessage
 * @property {function(StartConversationPayload): void} startConversation
 * @property {function(FetchChatHistoryPayload): void} fetchChatHistory
 * @property {function(FetchUserMetadataPayload): void} getCurrentState
 * @property {function(SyncConversationPayload): void} syncConversation
 * @property {function(TypingStatusPayload): void} sendTypingStatus
 * @property {function(PresenceStatusPayload): void} updatePresence
 * @property {function({ready: boolean}): void} setReady
 * @property {function(): void} disconnect
 */

/**
 * @param {WebSocketClient} wsClient
 * @returns {WebSocketActions}
 */
export const createWebSocketActions = (wsClient) => ({
  connect: async () => {
    try {
      // First establish the WebSocket connection
      await wsClient.connect();
      console.log('WebSocket connection established, updating connection ID in database...');
      
      // Then send the connect action to update the connection ID in the database
      // Add a small delay to ensure the connection is fully established
      await new Promise(resolve => setTimeout(resolve, 100));
      await wsClient.send({ action: 'connect', data: {} });
      console.log('Connection ID updated in database successfully');
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
    await wsClient.send({ action: 'getCurrentState', data: payload });
  },

  syncConversation: async (payload) => {
    await wsClient.send({ action: 'syncConversation', data: payload });
  },

  /**
   * @deprecated This function has been deprecated and no longer sends typing status.
   * Calls to this function will log a warning but otherwise have no effect.
   * Will be reimplemented in a future update.
   */
  sendTypingStatus: async (payload) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn('sendTypingStatus WebSocket action is deprecated and has been disabled.');
    }
    // No-op: Function preserved for API compatibility but does nothing
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

// Export the type for TypeScript/JSDoc
export const WebSocketActions = createWebSocketActions; 
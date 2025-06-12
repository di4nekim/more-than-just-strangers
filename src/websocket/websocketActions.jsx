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
 * @property {function(ConnectPayload): void} connect
 * @property {function(ReadyToAdvancePayload): void} sendReadyToAdvance
 * @property {function(EndConversationPayload): void} endConversation
 * @property {function(SendMessagePayload): void} sendMessage
 * @property {function(StartConversationPayload): void} startConversation
 * @property {function(FetchChatHistoryPayload): void} fetchChatHistory
 * @property {function(FetchUserMetadataPayload): void} fetchUserMetadata
 * @property {function(SyncConversationPayload): void} syncConversation
 * @property {function(TypingStatusPayload): void} sendTypingStatus
 * @property {function(PresenceStatusPayload): void} updatePresence
 * @property {function(): void} disconnect
 */

/**
 * @param {WebSocketClient} wsClient
 * @returns {WebSocketActions}
 */
export const createWebSocketActions = (wsClient) => ({
  connect: (payload) => {
    wsClient.send({ action: 'connect', ...payload });
  },

  sendReadyToAdvance: (payload) => {
    wsClient.send({ action: 'readyToAdvance', ...payload });
  },

  endConversation: (payload) => {
    wsClient.send({ action: 'endConversation', ...payload });
  },

  sendMessage: (payload) => {
    wsClient.send({ action: 'message', ...payload });
  },

  startConversation: (payload) => {
    wsClient.send({ action: 'startConversation', ...payload });
  },

  fetchChatHistory: (payload) => {
    wsClient.send({ action: 'fetchChatHistory', ...payload });
  },

  fetchUserMetadata: (payload) => {
    wsClient.send({ action: 'fetchUserMetadata', ...payload });
  },

  syncConversation: (payload) => {
    wsClient.send({ action: 'syncConversation', ...payload });
  },

  sendTypingStatus: (payload) => {
    wsClient.send({ action: 'typingStatus', ...payload });
  },

  updatePresence: (payload) => {
    wsClient.send({ action: 'presenceStatus', ...payload });
  },

  disconnect: () => {
    wsClient.disconnect();
  }
}); 
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
 * @property {function(): void} disconnect
 */

/**
 * @param {WebSocketClient} wsClient
 * @returns {WebSocketActions}
 */
export const createWebSocketActions = (wsClient) => ({
  sendReadyToAdvance: (payload) => {
    wsClient.send({ action: 'setReady', data: payload });
  },

  endConversation: (payload) => {
    wsClient.send({ action: 'endConversation', data: payload });
  },

  sendMessage: (payload) => {
    wsClient.send({ action: 'sendMessage', data: payload });
  },

  startConversation: (payload) => {
    wsClient.send({ action: 'startConversation', data: payload });
  },

  fetchChatHistory: (payload) => {
    wsClient.send({ action: 'fetchChatHistory', data: payload });
  },

  getCurrentState: (payload) => {
    wsClient.send({ action: 'getCurrentState', data: payload });
  },

  syncConversation: (payload) => {
    wsClient.send({ action: 'syncConversation', data: payload });
  },

  sendTypingStatus: (payload) => {
    wsClient.send({ action: 'typingStatus', data: payload });
  },

  updatePresence: (payload) => {
    wsClient.send({ action: 'updatePresence', data: payload });
  },

  disconnect: () => {
    wsClient.disconnect();
  }
}); 
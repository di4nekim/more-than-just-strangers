import { WebSocketClient } from './websocketHandler';
import {
  WebSocketActions as WebSocketActionsType,
  ConnectPayload,
  StartConversationPayload,
  ReadyToAdvancePayload,
  EndConversationPayload,
  SendMessagePayload,
  FetchChatHistoryPayload,
  FetchUserMetadataPayload,
  FetchConversationMetadataPayload,
  SyncConversationPayload,
  TypingStatusPayload,
  PresenceStatusPayload
} from './websocketTypes';

// Re-export the WebSocketActions type
export type WebSocketActions = WebSocketActionsType;

// WebSocket action creators
export const createWebSocketActions = (wsClient: WebSocketClient): WebSocketActions => ({
  // Initial connection
  connect: (payload: ConnectPayload) => {
    wsClient.send({
      action: 'connect',
      data: payload
    });
  },

  // Question ready status
  sendReadyToAdvance: (payload: ReadyToAdvancePayload) => {
    wsClient.send({
      action: 'setReady',
      data: {
        userId: payload.userId,
        chatId: payload.chatId
      }
    });
  },

  // End chat/conversation
  endChat: (payload: EndConversationPayload) => {
    wsClient.send({
      action: 'endConversation',
      data: {
        userId: payload.userId,
        chatId: payload.chatId,
        endReason: payload.endReason,
        endedBy: payload.endedBy
      }
    });
  },

  // Send message
  sendMessage: (payload: SendMessagePayload) => {
    wsClient.send({
      action: 'sendMessage',
      payload
    });
  },

  // Start conversation
  startConversation: (payload: StartConversationPayload) => {
    wsClient.send({
      action: 'startConversation',
      data: {
        userAId: payload.userAId,
        userBId: payload.userBId
      }
    });
  },

  // Fetch chat history
  fetchChatHistory: (payload: FetchChatHistoryPayload) => {
    wsClient.send({
      action: 'fetchChatHistory',
      data: {
        chatId: payload.chatId,
        limit: payload.limit || 50,
        lastEvaluatedKey: payload.lastEvaluatedKey
      }
    });
  },

  // Fetch user metadata
  fetchUserMetadata: (payload: FetchUserMetadataPayload) => {
    wsClient.send({
      action: 'getUserMetadata',
      data: {
        userId: payload.userId
      }
    });
  },

  // Fetch conversation metadata
  fetchConversationMetadata: (payload: FetchConversationMetadataPayload) => {
    wsClient.send({
      action: 'getConversationMetadata',
      data: {
        chatId: payload.chatId
      }
    });
  },

  // Sync conversation metadata
  syncConversation: (payload: SyncConversationPayload) => {
    wsClient.send({
      action: 'syncConversation',
      data: {
        chatId: payload.chatId
      }
    });
  },

  // Typing status
  sendTypingStatus: (payload: TypingStatusPayload) => {
    wsClient.send({
      action: 'typingStatus',
      data: payload
    });
  },

  // Presence status
  updatePresence: (payload: PresenceStatusPayload) => {
    wsClient.send({
      action: 'updatePresence',
      data: payload
    });
  }
}); 
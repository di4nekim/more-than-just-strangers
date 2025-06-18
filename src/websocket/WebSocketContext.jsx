'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { WebSocketClient } from './websocketHandler';
import { WebSocketActions, createWebSocketActions } from './websocketActions';
import { UserMetadata, ConversationMetadata, PresenceStatusPayload } from './websocketTypes';

/**
 * @typedef {Object} WebSocketContextType
 * @property {WebSocketClient|null} wsClient
 * @property {WebSocketActions|null} wsActions
 * @property {boolean} isConnected
 * @property {UserMetadata} userMetadata
 * @property {ConversationMetadata} conversationMetadata
 * @property {function(): void} syncConversation
 * @property {function(string): void} initializeUserSession - Initialize user session with userId
 * @property {{status: 'online'|'offline'|'away', lastSeen?: string}|null} otherUserPresence
 * @property {Record<string, boolean>} typingStatus
 */

const initialUserMetadata = {
  userId: null,
  connectionId: null,
  chatId: null,
  ready: false,
  questionIndex: 0,
  lastSeen: null,
  createdAt: null
};

const initialConversationMetadata = {
  chatId: null,
  participants: [],
  lastMessage: null,
  lastUpdated: null,
  endedBy: null,
  endReason: null,
  createdAt: null
};

const WebSocketContext = createContext({
  wsClient: null,
  wsActions: null,
  isConnected: false,
  userMetadata: initialUserMetadata,
  conversationMetadata: initialConversationMetadata,
  syncConversation: () => {},
  initializeUserSession: () => {},
  otherUserPresence: null,
  typingStatus: {}
});

export const useWebSocket = () => useContext(WebSocketContext);

/**
 * @typedef {Object} WebSocketProviderProps
 * @property {React.ReactNode} children
 */

// Helper function to safely convert participants to array (handles both Array and Set formats)
const getParticipantsAsArray = (participants) => {
  if (!participants) return [];
  if (Array.isArray(participants)) return participants;
  if (participants instanceof Set) return [...participants];
  // Handle DynamoDB Set format (it comes as an object with values property)
  if (participants && typeof participants === 'object' && participants.values) {
    return participants.values;
  }
  // Handle string sets from DynamoDB (SS type)
  if (participants && typeof participants === 'object' && participants.SS) {
    return participants.SS;
  }
  return [];
};

/**
 * @param {WebSocketProviderProps} props
 */
export const WebSocketProvider = ({ children }) => {
  const [wsClient, setWsClient] = useState(null);
  const [wsActions, setWsActions] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [userMetadata, setUserMetadata] = useState(initialUserMetadata);
  const [conversationMetadata, setConversationMetadata] = useState(initialConversationMetadata);
  const [otherUserPresence, setOtherUserPresence] = useState(null);
  const [typingStatus, setTypingStatus] = useState({});

  // Function to sync conversation metadata
  const syncConversation = () => {
    if (wsActions && userMetadata.chatId) {
      wsActions.syncConversation({ chatId: userMetadata.chatId });
    }
  };

  // Function to initialize user session - this is what components should call
  const initializeUserSession = (userId) => {
    console.log('📍 WebSocketContext: initializeUserSession called with userId:', userId);
    
    // Don't fetch if we already have the same user's data
    if (userMetadata.userId === userId) {
      console.log('📍 WebSocketContext: User session already initialized for userId:', userId);
      return;
    }

    if (wsActions && userId) {
      console.log('📍 WebSocketContext: Fetching user state for userId:', userId);
      wsActions.getCurrentState({ userId });
    }
  };

  useEffect(() => {
    
    const client = new WebSocketClient(process.env.NEXT_PUBLIC_WEBSOCKET_API_URL);
    
    // Set up message handlers
    client.onMessage('currentState', (payload) => {
      console.log('📍 WebSocketContext: Received currentState payload:', payload);
      setUserMetadata(payload);
      // Set the user ID in the WebSocket client
      if (payload.userId) {
        client.setUserId(payload.userId);
      }
      // If we have a chatId, automatically sync the conversation metadata
      if (payload.chatId) {
        console.log('📍 WebSocketContext: User has active chatId, syncing conversation:', payload.chatId);
        const actions = createWebSocketActions(client);
        actions.syncConversation({ chatId: payload.chatId });
      }
    });

    client.onMessage('conversationStarted', (payload) => {
      setConversationMetadata({
        chatId: payload.chatId,
        participants: getParticipantsAsArray(payload.participants),
        lastMessage: null,
        lastUpdated: payload.createdAt,
        endedBy: null,
        endReason: null,
        createdAt: payload.createdAt
      });
    });

    client.onMessage('conversationEnded', (payload) => {
      setConversationMetadata(prev => ({
        ...prev,
        endedBy: payload.endedBy,
        endReason: payload.endReason,
        lastUpdated: payload.timestamp
      }));
    });

    client.onMessage('message', (payload) => {
      setConversationMetadata(prev => ({
        ...prev,
        lastMessage: {
          content: payload.content,
          sentAt: payload.timestamp
        },
        lastUpdated: payload.timestamp
      }));
    });

    client.onMessage('conversationSync', (payload) => {
      console.log('Received conversationSync payload in websocketContext:', payload);
      // Update conversation metadata with the synced data
      setConversationMetadata({
        chatId: payload.chatId,
        participants: getParticipantsAsArray(payload.participants),
        lastMessage: payload.lastMessage || null,
        lastUpdated: payload.lastUpdated || null,
        endedBy: payload.endedBy || null,
        endReason: payload.endReason || null,
        createdAt: payload.createdAt || null
      });
    });

    client.onMessage('typingStatus', (payload) => {
      setTypingStatus(prev => ({
        ...prev,
        [payload.userId]: payload.isTyping
      }));
    });

    client.onMessage('presenceStatus', (payload) => {
      setOtherUserPresence({
        status: payload.status,
        lastSeen: payload.lastSeen
      });
    });

    client.onMessage('error', (payload) => {
      console.error('📍 WebSocketContext: Received error message:', payload);
      // You could set an error state here if needed
      // setError(payload.error);
    });

    client.connect()
      .then(() => {
        setIsConnected(true);
        setWsClient(client);
        const actions = createWebSocketActions(client);
        setWsActions(actions);
        // Don't call getCurrentState here - let individual components handle it
        console.log('📍 WebSocketContext: WebSocket connected, actions created');
      })
      .catch((error) => {
        console.error('📍 WebSocketContext: Connection error:', error);
      });

    return () => {
      client.disconnect();
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ 
      wsClient, 
      wsActions, 
      isConnected, 
      userMetadata, 
      conversationMetadata,
      syncConversation,
      initializeUserSession,
      otherUserPresence,
      typingStatus
    }}>
      {children}
    </WebSocketContext.Provider>
  );
}; 
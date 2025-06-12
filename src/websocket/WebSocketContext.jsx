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
  otherUserPresence: null,
  typingStatus: {}
});

export const useWebSocket = () => useContext(WebSocketContext);

/**
 * @typedef {Object} WebSocketProviderProps
 * @property {React.ReactNode} children
 */

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

  useEffect(() => {
    
    const client = new WebSocketClient(process.env.WEBSOCKET_API_URL);
    
    // Set up message handlers
    client.onMessage('currentState', (payload) => {
      setUserMetadata(payload);
      // Set the user ID in the WebSocket client
      if (payload.userId) {
        client.setUserId(payload.userId);
      }
      // If we have a chatId, sync the conversation metadata
      if (payload.chatId) {
        syncConversation();
      }
    });

    client.onMessage('conversationStarted', (payload) => {
      setConversationMetadata({
        chatId: payload.chatId,
        participants: payload.participants,
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
      setConversationMetadata(payload);
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

    client.connect()
      .then(() => {
        setIsConnected(true);
        setWsClient(client);
        const actions = createWebSocketActions(client);
        setWsActions(actions);
        // Request initial state using the action creator
        actions.fetchUserMetadata({ userId: '' });
      })
      .catch(console.error);

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
      otherUserPresence,
      typingStatus
    }}>
      {children}
    </WebSocketContext.Provider>
  );
}; 
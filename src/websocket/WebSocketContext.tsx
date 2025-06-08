import React, { createContext, useContext, useEffect, useState } from 'react';
import { WebSocketClient } from './websocketHandler';
import { WebSocketActions, createWebSocketActions } from './websocketActions';
import { UserMetadata, ConversationMetadata } from './websocketTypes';

interface WebSocketContextType {
  wsClient: WebSocketClient | null;
  wsActions: WebSocketActions | null;
  isConnected: boolean;
  userMetadata: UserMetadata;
  conversationMetadata: ConversationMetadata;
  syncConversation: () => void;
  otherUserPresence: { status: 'online' | 'offline' | 'away', lastSeen?: string } | null;
  typingStatus: Record<string, boolean>;
}

const initialUserMetadata: UserMetadata = {
  userId: null,
  connectionId: null,
  chatId: null,
  ready: false,
  questionIndex: 0,
  lastSeen: null,
  createdAt: null
};

const initialConversationMetadata: ConversationMetadata = {
  chatId: null,
  participants: [],
  lastMessage: null,
  lastUpdated: null,
  endedBy: null,
  endReason: null,
  createdAt: null
};

const WebSocketContext = createContext<WebSocketContextType>({
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

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [wsClient, setWsClient] = useState<WebSocketClient | null>(null);
  const [wsActions, setWsActions] = useState<WebSocketActions | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [userMetadata, setUserMetadata] = useState<UserMetadata>(initialUserMetadata);
  const [conversationMetadata, setConversationMetadata] = useState<ConversationMetadata>(initialConversationMetadata);
  const [otherUserPresence, setOtherUserPresence] = useState<{ status: 'online' | 'offline' | 'away', lastSeen?: string } | null>(null);
  const [typingStatus, setTypingStatus] = useState<Record<string, boolean>>({});

  // Function to sync conversation metadata
  const syncConversation = () => {
    if (wsActions && userMetadata.chatId) {
      wsActions.syncConversation({ chatId: userMetadata.chatId });
    }
  };

  useEffect(() => {
    // Use local WebSocket endpoint for development
    const wsEndpoint = process.env.NODE_ENV === 'development' 
      ? 'ws://localhost:3001'
      : process.env.NEXT_PUBLIC_WEBSOCKET_API_ENDPOINT || '';
    
    const client = new WebSocketClient(wsEndpoint);
    
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
      // The server now sends the other user's ID directly
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
        actions.fetchUserMetadata({ userId: null });
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
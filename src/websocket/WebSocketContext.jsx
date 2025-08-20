/**
 * WebSocket Context with REST API Integration
 * 
 * Unified data layer managing WebSocket real-time updates and REST API operations.
 * Handles initialization, message management, and hybrid data loading.
 */

'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { WebSocketClient } from './websocketHandler';
import { WebSocketActions, createWebSocketActions } from './websocketActions';
import { UserMetadata, ConversationMetadata, PresenceStatusPayload } from './websocketTypes';
import { apiClient, authenticatedFetch } from '../app/lib/api-client';
import { getAuth } from 'firebase/auth';

/**
 * @typedef {Object} Message
 * @property {string} id
 * @property {string} content
 * @property {string} senderId
 * @property {string} timestamp
 * @property {boolean} [isOptimistic] - For messages sent via REST but not yet confirmed via WebSocket
 */

/**
 * @typedef {Object} UserProfile
 * @property {string} userId
 * @property {string} email
 * @property {string} name
 * @property {Object} preferences
 */

/**
 * @typedef {Object} InitializationState
 * @property {boolean} isInitializing
 * @property {boolean} profileLoaded
 * @property {boolean} chatContextLoaded
 * @property {boolean} wsConnected
 * @property {string|null} error
 */

/**
 * @typedef {Object} WebSocketContextType
 * @property {WebSocketClient|null} wsClient
 * @property {WebSocketActions|null} wsActions
 * @property {boolean} isConnected
 * @property {UserMetadata} userMetadata
 * @property {ConversationMetadata} conversationMetadata
 * @property {UserProfile|null} userProfile
 * @property {Message[]} messages
 * @property {InitializationState} initState
 * @property {boolean} hasActiveChat
 * @property {boolean} isLoadingMessages
 * @property {boolean} hasMoreMessages
 * @property {{status: 'online'|'offline'|'away', lastSeen?: string}|null} otherUserPresence
 * @property {Record<string, boolean>} typingStatus
 * @property {{isOnline: boolean, restApiHealthy: boolean, wsConnected: boolean}} networkStatus
 * @property {function(string): Promise<void>} initializeUser - Initialize complete user session
 * @property {function(): Promise<Object>} startNewChat - Start matchmaking and create new chat
 * @property {function(string, string?): Promise<void>} endChat - End current chat
 * @property {function(): Promise<void>} loadMoreMessages - Load older messages
 * @property {function(string): Promise<void>} sendMessageOptimistic - Send message with optimistic update
 * @property {function(string): Promise<boolean>} validateChatAccess - Check if user can access chat
 * @property {function(): void} resetInitialization - Reset initialization state for new user
 * @property {function(string): void} invalidateCache - Invalidate cached data
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

const initialInitState = {
  isInitializing: false,
  profileLoaded: false,
  chatContextLoaded: false,
  wsConnected: false,
  error: null,
  lastSyncTime: null,
  retryCount: 0,
  maxRetries: 3
};

const WebSocketContext = createContext({
  wsClient: null,
  wsActions: null,
  isConnected: false,
  userMetadata: initialUserMetadata,
  conversationMetadata: initialConversationMetadata,
  userProfile: null,
  messages: [],
  initState: initialInitState,
  hasActiveChat: false,
  isLoadingMessages: false,
  hasMoreMessages: true,
  otherUserPresence: null,
  typingStatus: {},
  networkStatus: {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    restApiHealthy: true,
    wsConnected: false
  },
  firebaseReady: false,
  initializeUser: async () => {},
  startNewChat: async () => ({}),
  endChat: async () => {},
  loadMoreMessages: async () => {},
  sendMessageOptimistic: async () => {},
  validateChatAccess: async () => false,
  resetInitialization: () => {},
  invalidateCache: () => {}
});

export const useWebSocket = () => useContext(WebSocketContext);

const getParticipantsAsArray = (participants) => {
  if (!participants) return [];
  if (Array.isArray(participants)) return participants;
  if (participants instanceof Set) return [...participants];
  if (participants?.values) return participants.values;
  if (participants?.SS) return participants.SS;
  return [];
};

const generateOptimisticId = () => `optimistic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const mergeOptimisticMessages = (previousMessages, fetchedMessages) => {
  const optimisticMessages = previousMessages.filter(msg => msg.isOptimistic);
  const allMessages = [...fetchedMessages];
  
  optimisticMessages.forEach(optimisticMsg => {
    const hasConfirmedVersion = fetchedMessages.some(msg => 
      msg.content === optimisticMsg.content && 
      msg.senderId === optimisticMsg.senderId &&
      Math.abs(new Date(msg.timestamp) - new Date(optimisticMsg.timestamp)) < 5000
    );
    if (!hasConfirmedVersion) {
      allMessages.push(optimisticMsg);
    }
  });
  
  return allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
};

export const WebSocketProvider = ({ children }) => {
  const [wsClient, setWsClient] = useState(null);
  const [wsActions, setWsActions] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [userMetadata, setUserMetadata] = useState(initialUserMetadata);
  const [conversationMetadata, setConversationMetadata] = useState(initialConversationMetadata);
  const [userProfile, setUserProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [initState, setInitState] = useState(initialInitState);
  const [hasActiveChat, setHasActiveChat] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [otherUserPresence, setOtherUserPresence] = useState(null);
  const [typingStatus, setTypingStatus] = useState({});
  const [networkStatus, setNetworkStatus] = useState({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    restApiHealthy: true,
    wsConnected: false
  });
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [matchmakingPromise, setMatchmakingPromise] = useState(null);
  const matchmakingPromiseRef = useRef(null);
  const userMetadataRef = useRef(userMetadata);
  const optimisticTimeouts = useRef(new Map());

  const messagesRef = useRef(messages);
  const lastMessageTimestamp = useRef(null);
  const queuedMessagesProcessedRef = useRef(new Set());
  const messageProcessingStatsRef = useRef({
    rawWebSocketReceived: 0,
    messageActionsReceived: 0,
    messagesAddedToState: 0,
    messagesFiltered: 0
  });
  
  const connectionStabilityRef = useRef({
    connectionChanges: 0,
    lastConnectionChange: null,
    disconnectionEvents: 0,
    reconnectionEvents: 0
  });

  // Function to update debug stats in the UI
  const updateDebugStats = useCallback(() => {
    try {
      const rawCountEl = document.getElementById('ws-raw-count');
      const messageActionsEl = document.getElementById('ws-message-actions');
      const messagesAddedEl = document.getElementById('ws-messages-added');
      const messagesFilteredEl = document.getElementById('ws-messages-filtered');
      
      if (rawCountEl) rawCountEl.textContent = messageProcessingStatsRef.current.rawWebSocketReceived;
      if (messageActionsEl) messageActionsEl.textContent = messageProcessingStatsRef.current.messageActionsReceived;
      if (messagesAddedEl) messagesAddedEl.textContent = messageProcessingStatsRef.current.messagesAddedToState;
      if (messagesFilteredEl) messagesFilteredEl.textContent = messageProcessingStatsRef.current.messagesFiltered;
    } catch (error) {
      // Silently ignore DOM access errors
    }
  }, []);

  useEffect(() => {
    matchmakingPromiseRef.current = matchmakingPromise;
    userMetadataRef.current = userMetadata;
  }, [matchmakingPromise, userMetadata]);

  // Load initial message history via WebSocket
  const loadInitialMessages = useCallback(async (chatId, limit = 50) => {
    if (!wsActions) {
      console.log('WebSocket actions not available, falling back to REST API');
      try {
        setIsLoadingMessages(true);
        const response = await authenticatedFetch(`/api/chat/${chatId}/messages?limit=${limit}`);
        
        const fetchedMessages = response.messages || [];
        
        setMessages(prev => mergeOptimisticMessages(prev, fetchedMessages));
        
        setHasMoreMessages(response.hasMore || false);
        
        if (fetchedMessages.length > 0) {
          lastMessageTimestamp.current = fetchedMessages[0]?.timestamp;
        }
      } catch (error) {
        console.error('Failed to load initial messages via REST API:', error);
      } finally {
        setIsLoadingMessages(false);
      }
      return;
    }

    try {
      setIsLoadingMessages(true);
      console.log('Loading initial messages via WebSocket for chatId:', chatId);
      
      // Use WebSocket to fetch chat history
      await wsActions.fetchChatHistory({
        chatId,
        limit
      });
      
      // The messages will be received via the 'chatHistory' message handler
      // which will update the messages state
    } catch (error) {
      console.error('Failed to load initial messages via WebSocket:', error);
      
      // Fallback to REST API if WebSocket fails
      try {
        const response = await authenticatedFetch(`/api/chat/${chatId}/messages?limit=${limit}`);
        
        const fetchedMessages = response.messages || [];
        
        setMessages(prev => mergeOptimisticMessages(prev, fetchedMessages));
        
        setHasMoreMessages(response.hasMore || false);
        
        if (fetchedMessages.length > 0) {
          lastMessageTimestamp.current = fetchedMessages[0]?.timestamp;
        }
      } catch (restError) {
        console.error('Failed to load initial messages via REST API fallback:', restError);
      }
    } finally {
      setIsLoadingMessages(false);
    }
  }, [wsActions]);

  // Load messages when userMetadata.chatId changes (for page refresh scenarios)
  useEffect(() => {
    if (userMetadata.chatId && messages.length === 0 && !isLoadingMessages) {
      console.log('User metadata has chatId but no messages loaded, loading messages:', userMetadata.chatId);
      loadInitialMessages(userMetadata.chatId).catch(error => {
        console.error('Failed to load messages for userMetadata chatId:', error);
      });
    }
  }, [userMetadata.chatId, messages.length, isLoadingMessages, loadInitialMessages]);

  // Clear queued messages processing ref when chat changes
  useEffect(() => {
    if (userMetadata.chatId) {
      console.log('WebSocket: Chat ID changed, clearing processed queued messages tracking');
      queuedMessagesProcessedRef.current.clear();
    }
  }, [userMetadata.chatId]);

  /**
   * Set up WebSocket message handlers
   * @param {WebSocketClient} wsClient
   */
  const setupMessageHandlers = useCallback((wsClient) => {
    console.log('🔧 WebSocket: Setting up message handlers...');
    console.log('WebSocket: Handler setup timestamp:', new Date().toISOString());
    console.log('🕐 HANDLER REGISTRATION TIMING:');
    console.log('WebSocket: Connection state at handler setup:', isConnected);
    console.log('WebSocket: User metadata at handler setup:', userMetadataRef.current);
    console.log('WebSocket: This is when handlers become available to process messages');
    
    // Add raw WebSocket message interception to catch EVERYTHING
    if (wsClient.ws && wsClient.ws.addEventListener) {
      wsClient.ws.addEventListener('message', (event) => {
        messageProcessingStatsRef.current.rawWebSocketReceived++;
        
        console.log('🚨 RAW WEBSOCKET MESSAGE RECEIVED:', {
          timestamp: new Date().toISOString(),
          userId: userMetadataRef.current?.userId,
          chatId: userMetadataRef.current?.chatId,
          connectionStable: connectionStabilityRef.current.disconnectionEvents === 0,
          rawData: event.data,
          totalRawReceived: messageProcessingStatsRef.current.rawWebSocketReceived
        });
        
        // Check if this looks like a message from another user
        try {
          const parsedData = JSON.parse(event.data);
          if (parsedData.action === 'message' && parsedData.data) {
            const messageData = parsedData.data;
            const isFromOtherUser = messageData.senderId !== userMetadataRef.current?.userId;
            const isForCurrentChat = messageData.chatId === userMetadataRef.current?.chatId;
            
            console.log('🎯 REAL-TIME MESSAGE ARRIVAL CHECK:', {
              messageId: messageData.messageId,
              senderId: messageData.senderId,
              currentUserId: userMetadataRef.current?.userId,
              isFromOtherUser,
              isForCurrentChat,
              chatId: messageData.chatId,
              currentChatId: userMetadataRef.current?.chatId,
              timestamp: messageData.timestamp || messageData.sentAt,
              content: messageData.content?.substring(0, 50) + '...'
            });
            
            if (isFromOtherUser && isForCurrentChat) {
              console.log('✅ VALID REAL-TIME MESSAGE DETECTED - Should be processed by handlers');
            } else if (!isFromOtherUser) {
              console.log('ℹ️ MESSAGE FROM SELF - Should be handled as confirmation');
            } else if (!isForCurrentChat) {
              console.log('⚠️ MESSAGE FOR DIFFERENT CHAT - Should be filtered out');
            }
          }
        } catch (parseError) {
          console.log('❌ Failed to parse raw WebSocket message:', parseError);
        }
        
        updateDebugStats();
        
        try {
          const parsedData = JSON.parse(event.data);
          console.log('🚨 PARSED WEBSOCKET DATA:', parsedData);
          
          // Check if this is a message for the current user
          if (parsedData.action === 'message' && parsedData.data) {
            messageProcessingStatsRef.current.messageActionsReceived++;
            console.log('🚨 MESSAGE ACTION DETECTED:', {
              messageChatId: parsedData.data.chatId,
              userChatId: userMetadataRef.current?.chatId,
              messageId: parsedData.data.messageId,
              senderId: parsedData.data.senderId,
              content: parsedData.data.content,
              messageActionsReceived: messageProcessingStatsRef.current.messageActionsReceived
            });
          }
        } catch (error) {
          console.log('🚨 Error parsing raw WebSocket data:', error);
        }
      });
    }
    
    // Add a general message listener to catch ALL incoming messages
    const originalOnMessage = wsClient.onMessage.bind(wsClient);
    wsClient.onMessage = function(action, handler) {
      console.log(`🎧 WebSocket: Registering handler for action: ${action}`);
      
      // Wrap the handler to add debugging
      const wrappedHandler = (data) => {
        console.log(`📨 WebSocket: INCOMING MESSAGE - Action: ${action}`);
        console.log(`WebSocket: Message timestamp: ${new Date().toISOString()}`);
        console.log(`WebSocket: Raw message data:`, JSON.stringify(data, null, 2));
        
        // Special logging for conversationEnded messages
        if (action === 'conversationEnded') {
          console.log('🔥🔥🔥 CONVERSATION ENDED MESSAGE RECEIVED 🔥🔥🔥');
          console.log('🔥 UserB should see their UI clear now');
          console.log('🔥 Message data:', JSON.stringify(data, null, 2));
        }
        
        // Call the original handler
        return handler(data);
      };
      
      return originalOnMessage(action, wrappedHandler);
    };
    
    // Handle current state response (for reconnection/refresh)
    wsClient.onMessage('currentState', (data) => {
      console.log('🔥 WebSocket: Received currentState response:', data);
      console.log('🔥 WebSocket: Previous local state - chatId:', userMetadataRef.current?.chatId, 'hasActiveChat:', hasActiveChat);
      
      setUserMetadata(prev => ({
        ...prev,
        userId: data.userId,
        connectionId: data.connectionId,
        chatId: data.chatId,
        ready: data.ready,
        questionIndex: data.questionIndex,
        lastSeen: data.lastSeen,
        createdAt: data.createdAt
      }));
      
      const newHasActiveChat = !!data.chatId;
      console.log('🔥 WebSocket: Setting hasActiveChat to:', newHasActiveChat, 'based on chatId:', data.chatId);
      setHasActiveChat(newHasActiveChat);
      
      // If we had an active chat but server says we don't, clear conversation-related state
      if (hasActiveChat && !newHasActiveChat) {
        console.log('🔥 WebSocket: Server indicates conversation ended - clearing local conversation state');
        setConversationMetadata(initialConversationMetadata);
        setMessages([]);
        
        // Clear optimistic timeouts
        optimisticTimeouts.current.forEach((timeoutId) => {
          clearTimeout(timeoutId);
        });
        optimisticTimeouts.current.clear();
      }
      
      // If user has an active chat, load the messages
      if (data.chatId && wsActions) {
        console.log('WebSocket: Loading messages for active chat:', data.chatId);
        loadInitialMessages(data.chatId).catch(error => {
          console.error('Failed to load messages for active chat:', error);
        });
      } else if (data.chatId && !wsActions) {
        console.log('WebSocket: WebSocket not available, loading messages via REST API for chat:', data.chatId);
        // Fallback to REST API if WebSocket is not available
        loadInitialMessages(data.chatId).catch(error => {
          console.error('Failed to load messages for active chat via REST API:', error);
        });
      }
      
      // If user is in matchmaking queue (no chatId but ready is true), restore queue state
      if (!data.chatId && data.ready) {
        console.log('WebSocket: Restoring matchmaking queue state');
        // This will be handled by the HomeContent component when it detects the state
      }
    });

    // Handle conversation started response
    wsClient.onMessage('conversationStarted', (data) => {
      console.log('WebSocket: Received conversationStarted response:', data);
      
      if (data.chatId) {
        setHasActiveChat(true);
        setUserMetadata(prev => ({
          ...prev,
          chatId: data.chatId
        }));
      }
      
      // Resolve the matchmaking promise if it exists
      if (matchmakingPromiseRef.current) {
        // Clear timeout if it exists (for safety)
        if (matchmakingPromiseRef.current.timeout) {
          clearTimeout(matchmakingPromiseRef.current.timeout);
        }
        
        // Handle both matched and queued responses
        if (data.matched && data.chatId) {
          // User was matched with someone
          matchmakingPromiseRef.current.resolve({
            chatId: data.chatId,
            participants: data.participants,
            matched: true,
            createdAt: data.createdAt
          });
        } else if (data.queued) {
          // User was added to queue (no match found yet)
          matchmakingPromiseRef.current.resolve({
            queued: true,
            message: data.message || 'Added to matchmaking queue'
          });
        } else {
          // Unexpected response
          matchmakingPromiseRef.current.reject(new Error('Unexpected matchmaking response'));
        }
        
        setMatchmakingPromise(null);
      }
    });

    // Handle conversation ended response (UX enhancement - not required for functionality)
    wsClient.onMessage('conversationEnded', (data) => {
      console.log('🔥 WebSocket: Received conversationEnded response (UX enhancement):', data);
      console.log('🔥 WebSocket: Current user metadata before clearing:', userMetadataRef.current);
      console.log('🔥 WebSocket: Current hasActiveChat before clearing:', hasActiveChat);
      
      // Extract data from the WebSocket message structure
      const conversationData = data?.data || data;
      console.log('🔥 WebSocket: Conversation ended data:', conversationData);
      
      // Clear local conversation state
      setHasActiveChat(false);
      setUserMetadata(prev => ({
        ...prev,
        chatId: null,
        ready: false,
        questionIndex: 0
      }));
      
      // Clear conversation metadata
      setConversationMetadata(initialConversationMetadata);
      
      // Clear any messages from the ended conversation
      setMessages([]);
      
      // Clear optimistic timeouts
      optimisticTimeouts.current.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      optimisticTimeouts.current.clear();
      
      console.log('🔥 WebSocket: Local state cleared after conversation ended');
      console.log('🔥 WebSocket: Conversation ended by:', conversationData.endedBy);
      console.log('🔥 WebSocket: End reason:', conversationData.endReason);
      console.log('🔥 WebSocket: hasActiveChat after clearing:', false);
      console.log('🔥 WebSocket: userMetadata after clearing should have chatId=null, questionIndex=0');
    });

    // Handle ping messages (for connection testing)
    wsClient.onMessage('ping', (data) => {
      console.log('🔥🔥🔥 PING MESSAGE RECEIVED 🔥🔥🔥');
      console.log('🔥 This confirms WebSocket connection is working');
      console.log('🔥 Ping data:', JSON.stringify(data, null, 2));
    });

    // Handle error responses
    wsClient.onMessage('error', (data) => {
      console.error('WebSocket: Received error response:', data);
      
      // Reject the matchmaking promise if it exists
      if (matchmakingPromiseRef.current) {
        // Clear timeout if it exists (for safety)
        if (matchmakingPromiseRef.current.timeout) {
          clearTimeout(matchmakingPromiseRef.current.timeout);
        }
        matchmakingPromiseRef.current.reject(new Error(data.error || 'WebSocket error'));
        setMatchmakingPromise(null);
      }
    });

    // Handle queued messages (messages sent while user was offline)
    wsClient.onMessage('queuedMessage', (data) => {
      console.log('WebSocket: Received queuedMessage:', data);
      console.log('WebSocket: Full queuedMessage data:', JSON.stringify(data, null, 2));
      console.log('WebSocket: Current userMetadata:', userMetadataRef.current);
      
      // Extract message data - handle nested data structure
      const messageData = data?.data || data;
      console.log('WebSocket: Extracted messageData:', messageData);
      
      // Verify this message is for the current user's chat
      if (messageData && messageData.chatId === userMetadataRef.current.chatId) {
        console.log('WebSocket: Processing queued message for current chat:', messageData.messageId);
        
        // Check if this message has already been processed to prevent duplicates
        if (queuedMessagesProcessedRef.current.has(messageData.messageId)) {
          console.log('WebSocket: Queued message already processed, skipping duplicate:', messageData.messageId);
          return;
        }
        
        // Create a new message object from the queued message
        const queuedMessage = {
          id: messageData.messageId,
          content: messageData.content,
          senderId: messageData.senderId,
          timestamp: messageData.timestamp,
          isQueued: true, // Mark as queued message
          receivedAt: new Date().toISOString()
        };
        
        console.log('WebSocket: Adding queued message to chat:', queuedMessage);
        
        // Add the queued message to the messages list
        setMessages(prev => {
          // Check if message already exists (avoid duplicates)
          const messageExists = prev.some(msg => msg.id === messageData.messageId);
          if (messageExists) {
            console.log('WebSocket: Queued message already exists, skipping duplicate:', messageData.messageId);
            return prev;
          }
          
          const updated = [...prev, queuedMessage];
          console.log('WebSocket: Messages after adding queued message:', updated);
          return updated;
        });
        
        // Mark this message as processed
        queuedMessagesProcessedRef.current.add(messageData.messageId);
        console.log('WebSocket: Queued message processed successfully:', messageData.messageId);
        
        // Show a notification to the user about new offline messages
        console.log('WebSocket: Showing notification for queued message');
        // You could add a toast notification here if desired
      } else {
        console.log('WebSocket: Ignoring queuedMessage - chatId mismatch or missing data');
        console.log('WebSocket: Received data:', data);
        console.log('WebSocket: Extracted messageData:', messageData);
        console.log('WebSocket: Current chatId:', userMetadataRef.current?.chatId);
        console.log('WebSocket: Message chatId:', messageData?.chatId);
        console.log('WebSocket: ChatId match:', messageData?.chatId === userMetadataRef.current?.chatId);
      }
    });

    // Handle message confirmation from backend
    wsClient.onMessage('messageConfirmed', (data) => {
      console.log('WebSocket: Received messageConfirmed:', data);
      console.log('WebSocket: Full messageConfirmed data:', JSON.stringify(data, null, 2));
      console.log('WebSocket: Data type:', typeof data);
      console.log('WebSocket: Data keys:', data ? Object.keys(data) : 'undefined');
      console.log('WebSocket: Current userMetadata:', userMetadataRef.current);
      
      // Handle message confirmation from sender's own message
      if (data && data.chatId === userMetadataRef.current.chatId) {
        console.log('WebSocket: Confirming optimistic message:', data.messageId);
        console.log('WebSocket: Current chatId:', userMetadataRef.current.chatId, 'Message chatId:', data.chatId);
        console.log('WebSocket: Message ID to confirm:', data.messageId);
        console.log('WebSocket: Message content to confirm:', data.content);
        
        setMessages(prev => {
          const messageToConfirm = prev.find(msg => msg.id === data.messageId);
          console.log('WebSocket: Found message to confirm:', messageToConfirm);
          console.log('WebSocket: All messages before confirmation:', prev);
          
          if (!messageToConfirm) {
            console.warn('WebSocket: WARNING - No optimistic message found to confirm with ID:', data.messageId);
            console.warn('WebSocket: This may indicate a message ID mismatch or the message was already confirmed');
            console.warn('WebSocket: Available message IDs:', prev.map(msg => ({ id: msg.id, isOptimistic: msg.isOptimistic })));
            return prev;
          }
          
          const updated = prev.map(msg => 
            msg.id === data.messageId 
              ? { ...msg, isOptimistic: false, confirmedAt: new Date().toISOString() }
              : msg
          );
          console.log('WebSocket: Messages after confirmation:', updated);
          return updated;
        });
        
        // Clear the timeout for the confirmed message
        const timeoutId = optimisticTimeouts.current.get(data.messageId);
        if (timeoutId) {
          clearTimeout(timeoutId);
          optimisticTimeouts.current.delete(data.messageId);
          console.log('WebSocket: Cleared timeout for confirmed message:', data.messageId);
        } else {
          console.warn('WebSocket: No timeout found for confirmed message:', data.messageId);
          console.warn('WebSocket: Available timeout IDs:', Array.from(optimisticTimeouts.current.keys()));
        }
        
        console.log('WebSocket: Message confirmation completed successfully for:', data.messageId);
      } else {
        console.log('WebSocket: Ignoring messageConfirmed - chatId mismatch or missing data');
        console.log('WebSocket: Received data:', data);
        console.log('WebSocket: Current chatId:', userMetadataRef.current?.chatId);
        console.log('WebSocket: Message chatId:', data?.chatId);
        console.log('WebSocket: ChatId match:', data?.chatId === userMetadataRef.current?.chatId);
      }
    });

    // Handle ready status updated response
    wsClient.onMessage('readyStatusUpdated', (data) => {
      console.log('WebSocket: Received readyStatusUpdated response:', data);
      console.log('WebSocket: Current userMetadata before update:', userMetadataRef.current);
      console.log('WebSocket: Data received - userId:', data.userId, 'ready:', data.ready, 'message:', data.message);
      
      // Update user metadata with new ready status immediately
      setUserMetadata(prev => {
        const updated = {
          ...prev,
          ready: data.ready
        };
        console.log('WebSocket: Updated userMetadata ready status from', prev.ready, 'to', data.ready);
        console.log('WebSocket: Full updated userMetadata:', updated);
        return updated;
      });
      
      console.log('WebSocket: Updated ready status to:', data.ready);
    });

    // Handle question advancement when both users are ready
    wsClient.onMessage('advanceQuestion', (data) => {
      console.log('WebSocket: Received advanceQuestion response:', data);
      console.log('WebSocket: Advancing question index to:', data.questionIndex);
      
      // Update user metadata with new question index and reset ready status
      setUserMetadata(prev => {
        const updated = {
          ...prev,
          questionIndex: data.questionIndex,
          ready: data.ready !== undefined ? data.ready : false
        };
        console.log('WebSocket: Updated questionIndex from', prev.questionIndex, 'to', data.questionIndex);
        console.log('WebSocket: Reset ready status to:', updated.ready);
        return updated;
      });
    });

    // Handle presence status updates (reverted to original working version)
    wsClient.onMessage('presenceStatus', (data) => {
      console.log('WebSocket: Received presenceStatus response:', data);
      // Update other user's presence status
      if (data.userId && data.status) {
        setOtherUserPresence({
          status: data.status,
          lastSeen: data.lastSeen
        });
      }
    });

    // Handle presence updated events (server-side presence changes)
    wsClient.onMessage('presenceUpdated', (data) => {
      console.log('WebSocket: Received presenceUpdated event:', data);
      // Update other user's presence status when server sends updates
      if (data.userId && data.status) {
        setOtherUserPresence({
          status: data.status,
          lastSeen: data.timestamp || data.lastSeen
        });
      }
    });

    // Handle other message types as needed
    console.log('🎯 REGISTERING MESSAGE HANDLER - Ready to receive real-time messages');
    wsClient.onMessage('message', (data) => {
      console.log('🔥 WebSocket: === INCOMING MESSAGE RECEIVED ===');
      console.log('WebSocket: Raw data received:', JSON.stringify(data, null, 2));
      console.log('WebSocket: Data type:', typeof data);
      console.log('WebSocket: Current userMetadata:', userMetadataRef.current);
      console.log('WebSocket: Current timestamp:', new Date().toISOString());
      
      // Extract message data - handle nested data structure
      const messageData = data?.data || data;
      console.log('WebSocket: Extracted messageData:', JSON.stringify(messageData, null, 2));
      console.log('WebSocket: Message chatId:', messageData?.chatId, 'User chatId:', userMetadataRef.current?.chatId);
      console.log('WebSocket: ChatId comparison:', {
        messageChatId: messageData?.chatId,
        userChatId: userMetadataRef.current?.chatId,
        match: messageData?.chatId === userMetadataRef.current?.chatId,
        messageDataExists: !!messageData,
        chatIdExists: !!messageData?.chatId
      });
      
      // Add the received message to the messages state
      if (messageData && messageData.chatId === userMetadataRef.current.chatId) {
        console.log('🎯 WebSocket: ChatId matches! Processing message...');
        console.log('WebSocket: Message details:', {
          messageId: messageData.messageId,
          content: messageData.content,
          senderId: messageData.senderId,
          timestamp: messageData.timestamp
        });
        
        const newMessage = {
          id: messageData.messageId,
          content: messageData.content,
          senderId: messageData.senderId,
          timestamp: messageData.timestamp,
          isOptimistic: false
        };
        
        console.log('WebSocket: Created newMessage object:', newMessage);
        console.log('🔍 MESSAGE FORMAT COMPARISON:');
        console.log('WebSocket raw messageData:', messageData);
        console.log('Frontend newMessage format:', newMessage);
        console.log('Field mapping check:', {
          'messageData.messageId → newMessage.id': messageData.messageId,
          'messageData.content → newMessage.content': messageData.content,
          'messageData.senderId → newMessage.senderId': messageData.senderId,
          'messageData.timestamp → newMessage.timestamp': messageData.timestamp,
          'messageData.sentAt (alternative)': messageData.sentAt
        });
        
        setMessages(prev => {
          console.log('WebSocket: Previous messages count:', prev.length);
          console.log('WebSocket: Previous message IDs:', prev.map(m => m.id));
          
          // Check for duplicates to prevent adding the same message twice
          const exists = prev.some(msg => msg.id === newMessage.id);
          if (exists) {
            console.log('⚠️ WebSocket: Message already exists, skipping duplicate:', newMessage.id);
            messageProcessingStatsRef.current.messagesFiltered++;
            return prev;
          }
          
          messageProcessingStatsRef.current.messagesAddedToState++;
          const updated = [...prev, newMessage];
          console.log('✅ WebSocket: Adding new message! Updated count:', updated.length);
          console.log('WebSocket: Updated message IDs:', updated.map(m => m.id));
          console.log('WebSocket: New message added:', newMessage);
          console.log('📊 WebSocket: Message processing stats:', messageProcessingStatsRef.current);
          
          // Update debug UI elements if they exist
          updateDebugStats();
          
          return updated;
        });
        
        console.log('🎉 WebSocket: Message processing completed successfully!');
      } else {
        messageProcessingStatsRef.current.messagesFiltered++;
        console.log('❌ WebSocket: Message REJECTED - chatId mismatch or missing data');
        console.log('📊 WebSocket: Message processing stats:', messageProcessingStatsRef.current);
        
        updateDebugStats();
        console.log('WebSocket: Rejection details:', {
          messageDataExists: !!messageData,
          messageChatId: messageData?.chatId,
          userChatId: userMetadataRef.current?.chatId,
          chatIdMatch: messageData?.chatId === userMetadataRef.current?.chatId,
          userMetadataExists: !!userMetadataRef.current
        });
      }
      console.log('🔥 WebSocket: === END MESSAGE PROCESSING ===');
    });



    wsClient.onMessage('messageReceived', (data) => {
      console.log('WebSocket: Received messageReceived:', data);
      
      // Extract message data - handle nested data structure
      const messageData = data?.data || data;
      console.log('WebSocket: Extracted messageData for messageReceived:', messageData);
      
      // Handle incoming messages (backward compatibility)
      if (messageData && messageData.chatId === userMetadataRef.current.chatId) {
        const newMessage = {
          id: messageData.messageId,
          content: messageData.content,
          senderId: messageData.senderId,
          timestamp: messageData.timestamp,
          isOptimistic: false
        };
        setMessages(prev => {
          // Check for duplicates to prevent adding the same message twice
          const exists = prev.some(msg => msg.id === newMessage.id);
          if (exists) {
            console.log('WebSocket: messageReceived already exists, skipping duplicate:', newMessage.id);
            return prev;
          }
          console.log('WebSocket: Adding messageReceived to state:', newMessage);
          return [...prev, newMessage];
        });
      }
    });



    wsClient.onMessage('chatHistory', (data) => {
      console.log('WebSocket: Received chat history:', data);
      if (data && data.messages) {
        // Transform the DynamoDB messages to match the expected format
        const transformedMessages = data.messages.map(msg => ({
          id: msg.messageId,
          content: msg.content,
          senderId: msg.senderId,
          timestamp: msg.sentAt,
          isOptimistic: false
        }));
        
        // Preserve any existing optimistic messages when loading chat history
        setMessages(prev => {
          const optimisticMessages = prev.filter(msg => msg.isOptimistic);
          console.log('WebSocket: Preserving optimistic messages:', optimisticMessages);
          console.log('WebSocket: Loaded chat history messages:', transformedMessages);
          
          // Combine loaded messages with optimistic messages, avoiding duplicates
          const allMessages = [...transformedMessages];
          optimisticMessages.forEach(optimisticMsg => {
            // Only add optimistic message if there's no confirmed version already
            const hasConfirmedVersion = transformedMessages.some(msg => 
              msg.content === optimisticMsg.content && 
              msg.senderId === optimisticMsg.senderId &&
              Math.abs(new Date(msg.timestamp) - new Date(optimisticMsg.timestamp)) < 5000 // Within 5 seconds
            );
            if (!hasConfirmedVersion) {
              allMessages.push(optimisticMsg);
            } else {
              console.log('WebSocket: Found confirmed version of optimistic message, not adding:', optimisticMsg);
            }
          });
          
          // Sort by timestamp to maintain order
          const sortedMessages = allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          console.log('WebSocket: Final messages after combining with optimistic:', sortedMessages);
          return sortedMessages;
        });
        
        setHasMoreMessages(data.hasMore || false);
        
        // Update the last message timestamp for pagination
        if (transformedMessages.length > 0) {
          lastMessageTimestamp.current = transformedMessages[0]?.timestamp;
        }
      }
    });

    wsClient.onMessage('userJoined', (data) => {
      console.log('WebSocket: User joined:', data);
      // Handle user joined events
    });

    wsClient.onMessage('userLeft', (data) => {
      console.log('WebSocket: User left:', data);
      // Handle user left events
    });

    // Handle server errors that might affect optimistic messages
    wsClient.onMessage('error', (data) => {
      console.log('WebSocket: Received error:', data);
      
      // Extract action from error data, with fallback to data.action for backward compatibility
      const action = data?.data?.action || data?.action;
      
      if (action) {
        switch (action) {
          case 'sendMessage':
            console.log('WebSocket: Server error for sendMessage action, removing optimistic messages');
            // Remove all optimistic messages since we can't determine which specific one failed
            setMessages(prev => {
              const filtered = prev.filter(msg => !msg.isOptimistic);
              console.log('WebSocket: Removed optimistic messages due to server error. Remaining messages:', filtered);
              return filtered;
            });
            
            // Clear all optimistic timeouts
            optimisticTimeouts.current.forEach((timeoutId) => {
              clearTimeout(timeoutId);
            });
            optimisticTimeouts.current.clear();
            break;
            
          case 'fetchChatHistory':
            console.log('WebSocket: Server error for fetchChatHistory action:', data.data?.error || data.error);
            // Set loading state to false and show error
            setIsLoadingMessages(false);
            // You could also set an error state here if you want to show it to the user
            break;
            
          default:
            console.log('WebSocket: Server error for action:', action, 'Error:', data.data?.error || data.error);
            // Handle other action errors as needed
            break;
        }
      } else {
        // Handle errors without action field (backward compatibility)
        console.log('WebSocket: Received error without action field:', data);
        // Set loading state to false for any error
        setIsLoadingMessages(false);
      }
    });
    
    console.log('WebSocket: Message handlers set up successfully');
  }, [loadInitialMessages, wsActions]); // Remove handlePresenceUpdate from dependencies

  // Check for Firebase readiness
  useEffect(() => {
    const checkFirebaseReady = async () => {
      try {
        // Wait for Firebase auth to be initialized
        const auth = getAuth();
        
        if (!auth) {
          console.log('WebSocketProvider: Firebase auth not available, using demo mode');
          setFirebaseReady(true);
          return;
        }
        
        // Wait for auth to be ready
        await new Promise((resolve) => {
          const checkReady = () => {
            if (auth) {
              resolve();
            } else {
              setTimeout(checkReady, 100);
            }
          };
          checkReady();
        });
        
        console.log('WebSocketProvider: Firebase is ready');
        setFirebaseReady(true);
      } catch (error) {
        console.error('WebSocketProvider: Error waiting for Firebase:', error);
        // Set Firebase as ready even if there's an error to prevent blocking
        console.log('WebSocketProvider: Setting Firebase as ready despite error');
        setFirebaseReady(true);
      }
    };

    checkFirebaseReady();
  }, []);

  // Initialize WebSocket client and actions when Firebase is ready
  useEffect(() => {
    console.log('WebSocketProvider: firebaseReady:', firebaseReady, 'wsClient:', !!wsClient);
    
    if (firebaseReady && !wsClient) {
      try {
        console.log('WebSocketProvider: Initializing WebSocket client...');
        
        // Validate environment variables
        const wsApiUrl = process.env.NEXT_PUBLIC_WEBSOCKET_API_URL;
        console.log('WebSocketProvider: Environment check:', {
          NEXT_PUBLIC_WEBSOCKET_API_URL: wsApiUrl,
          NODE_ENV: process.env.NODE_ENV,
          hasWsApiUrl: !!wsApiUrl
        });
        
        if (!wsApiUrl) {
          console.warn('WebSocketProvider: NEXT_PUBLIC_WEBSOCKET_API_URL is not configured');
          console.warn('WebSocket will not be available. Please set NEXT_PUBLIC_WEBSOCKET_API_URL in your environment variables');
          setInitState(prev => ({ 
            ...prev, 
            error: 'WebSocket API URL not configured - WebSocket features will be disabled' 
          }));
          return;
        }
        
        console.log('WebSocketProvider: Using WebSocket URL:', wsApiUrl);
        
        // Create connection state callback
        const onConnectionStateChange = (connected) => {
          // Track connection stability
          const now = new Date().toISOString();
          connectionStabilityRef.current.connectionChanges++;
          connectionStabilityRef.current.lastConnectionChange = now;
          
          if (connected && !isConnected) {
            connectionStabilityRef.current.reconnectionEvents++;
            console.log('🟢 CONNECTION ESTABLISHED - Ready to receive real-time messages');
            
            // Refresh state on reconnection to sync with database
            console.log('🔄 Triggering state refresh on reconnection');
            setTimeout(() => {
              if (actions && userProfile?.userId) {
                actions.getCurrentState({ userId: userProfile.userId }).catch(error => {
                  console.error('🔄 Error refreshing state on reconnection:', error);
                });
              }
            }, 1000); // Small delay to ensure connection is stable
            
          } else if (!connected && isConnected) {
            connectionStabilityRef.current.disconnectionEvents++;
            console.log('🔴 CONNECTION LOST - Real-time messages will be missed');
          }
          
          console.log('🔌 WebSocket: === CONNECTION STATE CHANGE ===');
          console.log('WebSocket: New connection state:', connected);
          console.log('WebSocket: Previous connection state:', isConnected);
          console.log('WebSocket: Connection stability stats:', connectionStabilityRef.current);
          console.log('WebSocket: Connection details - wsClient:', !!client, 'wsActions:', !!actions);
          console.log('WebSocket: Connection change timestamp:', now);
          console.log('WebSocket: Current userMetadata:', userMetadataRef.current);
          
          setIsConnected(connected);
          
          if (connected) {
            console.log('✅ WebSocket: Successfully connected to backend!');
            console.log('WebSocket: Ready to send/receive messages');
            console.log('WebSocket: Current chat ID:', userMetadataRef.current?.chatId);
            // Connection established - queued messages will be fetched by ChatRoom component
          } else {
            console.log('❌ WebSocket: Disconnected from backend');
            console.log('WebSocket: Messages will not be received until reconnected');
          }
          console.log('🔌 WebSocket: === END CONNECTION STATE CHANGE ===');
        };
        
        const client = new WebSocketClient(wsApiUrl, onConnectionStateChange);
        console.log('WebSocketProvider: WebSocketClient created successfully');
        
        const actions = createWebSocketActions(client);
        console.log('WebSocketProvider: WebSocket actions created successfully');
        
        // Set up message handlers
        setupMessageHandlers(client);
        console.log('WebSocketProvider: Message handlers set up successfully');
        
        setWsClient(client);
        setWsActions(actions);
        
        console.log('WebSocketProvider: WebSocket client and actions initialized and set in state');
        
        // Try to establish initial connection
        console.log('WebSocketProvider: Attempting initial connection...');
        client.connect().then(() => {
          console.log('WebSocketProvider: Initial connection attempt completed');
        }).catch((error) => {
          console.error('WebSocketProvider: Initial connection failed:', error);
          console.error('WebSocketProvider: Connection error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
          });
        });
      } catch (error) {
        console.error('WebSocketProvider: Failed to initialize WebSocket client:', error);
        setInitState(prev => ({ 
          ...prev, 
          error: `WebSocket initialization failed: ${error.message}` 
        }));
      }
    }
  }, [firebaseReady, wsClient]);

  // Update messages ref when messages change
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Reset initialization state
  const resetInitialization = useCallback(() => {
    setInitState(initialInitState);
    setUserProfile(null);
    setUserMetadata(initialUserMetadata);
    setConversationMetadata(initialConversationMetadata);
    setMessages([]);
    setHasActiveChat(false);
    setOtherUserPresence(null);
    setTypingStatus({});
    lastMessageTimestamp.current = null;
    queuedMessagesProcessedRef.current.clear();
  }, []);

  // Initialize complete user session
  const initializeUser = useCallback(async (userId) => {
    if (!userId) return;
    
    // Wait for Firebase to be ready before proceeding
    if (!firebaseReady) {
      console.log('WebSocketProvider: Waiting for Firebase to be ready before initializing user...');
      return;
    }
    
    // Prevent multiple initializations
    if (initState.isInitializing) {
      console.log('Initialization already in progress, skipping');
      return;
    }

    // Check if user is already initialized with the same userId
    if (userMetadata.userId === userId && initState.profileLoaded && !initState.error) {
      console.log('User already initialized with same userId, skipping');
      return;
    }

    // Create cancellation token
    const abortController = new AbortController();
    const signal = abortController.signal;

    setInitState(prev => ({ ...prev, isInitializing: true, error: null }));

    try {
      // Check if we should cancel
      if (signal.aborted) throw new Error('Initialization cancelled');

      // Check if Firebase is configured before making API calls
      try {
        // Step 1: Load user profile (this one works with Firebase)
        const profile = await apiClient.getCurrentUserProfile();
        if (signal.aborted) throw new Error('Initialization cancelled');
        
        // Defer state updates to prevent render-time updates
        setTimeout(() => {
          setUserProfile(profile);
          setInitState(prev => ({ ...prev, profileLoaded: true }));
        }, 0);

        // Step 2: Establish WebSocket connection first
        if (!signal.aborted) {
          // Wait for WebSocket actions to be available
          if (!wsActions) {
            console.log('Waiting for WebSocket actions to be initialized...');
            // Wait up to 5 seconds for WebSocket actions to be ready
            let attempts = 0;
            while (!wsActions && attempts < 50 && !signal.aborted) {
              await new Promise(resolve => setTimeout(resolve, 100));
              attempts++;
            }
            
            if (!wsActions) {
              throw new Error('WebSocket actions not available after waiting');
            }
          }
          
          await initializeWebSocketConnection(userId);
        }

        // Step 3: Get current state from backend via WebSocket
        if (!signal.aborted && wsActions) {
          console.log('Getting current state from backend via WebSocket...');
          await wsActions.getCurrentState({ userId });
          console.log('getCurrentState request sent');
        }

        // Step 4: Mark initialization as complete
        setTimeout(() => {
          setInitState(prev => ({ 
            ...prev, 
            isInitializing: false,
            lastSyncTime: new Date().toISOString()
          }));
        }, 0);

      } catch (error) {
        if ((error.message && error.message.includes('Firebase is not configured')) || 
            (error.message && error.message.includes('not configured'))) {
          console.log('Firebase not yet configured, retrying in 1 second...');
          // Retry after a short delay
          setTimeout(() => {
            if (!signal.aborted) {
              initializeUser(userId);
            }
          }, 1000);
          return;
        }
        throw error;
      }

      // Store abort controller for cleanup
      return () => abortController.abort();

    } catch (error) {
      if (error.message === 'Initialization cancelled') {
        console.log('User initialization was cancelled');
        return;
      }
      
      // Check if it's an authentication error
      if (error.message && (
        error.message.includes('Authentication required') ||
        error.message.includes('No authenticated user') ||
        error.message.includes('Firebase authentication timeout') ||
        error.message.includes('Authentication failed')
      )) {
        console.log('Authentication error during initialization:', error.message);
        // Don't set this as a permanent error, just wait for authentication
        setTimeout(() => {
          setInitState(prev => ({ 
            ...prev, 
            isInitializing: false, 
            error: null // Clear error for auth issues
          }));
        }, 0);
        return;
      }
      
      console.error('Failed to initialize user:', error);
      setTimeout(() => {
        setInitState(prev => ({ 
          ...prev, 
          isInitializing: false, 
          error: error.message 
        }));
      }, 0);
    }
  }, [firebaseReady, initState.isInitializing, userMetadata.chatId, wsActions]);

  // Set up connection heartbeat to monitor and maintain WebSocket connection
  const setupConnectionHeartbeat = useCallback(() => {
    const heartbeatInterval = setInterval(() => {
      if (wsActions && isConnected && userMetadata.userId) {
        // Send a lightweight heartbeat to ensure connection is alive
        wsActions.updatePresence({ 
          userId: userMetadata.userId, 
          status: 'online' 
        }).catch(error => {
          console.warn('Heartbeat failed, connection may be stale:', error);
          // If heartbeat fails, try to reconnect
          if (wsActions && userMetadata.userId) {
            console.log('Attempting to reconnect due to failed heartbeat...');
            wsActions.connect().catch(reconnectError => {
              console.error('Reconnection failed:', reconnectError);
            });
          }
        });
      }
    }, 30000); // Check every 30 seconds

    // Store the interval ID for cleanup
    return () => clearInterval(heartbeatInterval);
  }, [wsActions, isConnected, userMetadata.userId]);

  // Auto-retry initializeUser when Firebase becomes ready
  useEffect(() => {
    const checkAndInitialize = async () => {
      if (firebaseReady && userMetadata.userId && !initState.isInitializing && !initState.profileLoaded && !initState.error) {
        try {
          // Check if user is actually authenticated before initializing
          const auth = getAuth();
          if (auth && auth.currentUser) {
            // Verify the user is fully authenticated by getting a token
            try {
              const token = await auth.currentUser.getIdToken();
              if (token) {
                console.log('User is authenticated, initializing user session...');
                initializeUser(userMetadata.userId);
              } else {
                console.log('User not fully authenticated yet, waiting...');
              }
            } catch (tokenError) {
              console.log('User authentication not ready yet, waiting...');
            }
          } else {
            console.log('No authenticated user yet, waiting for sign-in...');
          }
        } catch (error) {
          console.log('Firebase auth check failed, waiting...');
        }
      }
    };

    checkAndInitialize();
  }, [firebaseReady, userMetadata.userId, initState.isInitializing, initState.profileLoaded, initState.error, initializeUser]);

  // Listen for authentication state changes
  useEffect(() => {
    const auth = getAuth();
    if (!auth) return;

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      console.log('Auth state changed:', user ? 'User signed in' : 'User signed out');
      
      if (user && firebaseReady && userMetadata.userId && !initState.isInitializing && !initState.profileLoaded) {
        try {
          // Verify the user is fully authenticated
          const token = await user.getIdToken();
          if (token) {
            console.log('User authenticated via auth state change, initializing...');
            initializeUser(userMetadata.userId);
          }
        } catch (error) {
          console.log('User not fully authenticated yet:', error.message);
        }
      } else if (!user) {
        // User signed out, reset initialization state
        setInitState(prev => ({ 
          ...prev, 
          isInitializing: false, 
          profileLoaded: false, 
          error: null 
        }));
      }
    });

    return () => unsubscribe();
  }, [firebaseReady, userMetadata.userId, initState.isInitializing, initState.profileLoaded, initializeUser]);

  // Load more messages (pagination)
  const loadMoreMessages = useCallback(async () => {
    if (!userMetadata.chatId || isLoadingMessages || !hasMoreMessages) return;

    try {
      setIsLoadingMessages(true);
      const response = await authenticatedFetch(
        `/api/chat/${userMetadata.chatId}/messages?before=${lastMessageTimestamp.current}&limit=20`
      );
      
      const olderMessages = response.messages || [];
      if (olderMessages.length > 0) {
        setMessages(prev => [...olderMessages, ...prev]);
        lastMessageTimestamp.current = olderMessages[0]?.timestamp;
        setHasMoreMessages(response.hasMore || false);
      } else {
        setHasMoreMessages(false);
      }
    } catch (error) {
      console.error('Failed to load more messages:', error);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [userMetadata.chatId, isLoadingMessages, hasMoreMessages]);

  // Fetch queued messages when user comes back online
  const fetchQueuedMessages = useCallback(async () => {
    if (!userMetadata.chatId) return;

    try {
      console.log('Fetching queued messages for user:', userMetadata.userId);
      const response = await authenticatedFetch(`/api/chat/${userMetadata.chatId}/queued-messages`);
      
      if (response.queuedMessages && response.queuedMessages.length > 0) {
        console.log('Found queued messages:', response.queuedMessages.length);
        
        // Add queued messages to the messages state
        const queuedMessages = response.queuedMessages.map(msg => ({
          id: msg.messageId,
          content: msg.message,
          senderId: msg.senderId,
          timestamp: msg.timestamp,
          isOptimistic: false,
          isQueued: true
        }));
        
        setMessages(prev => {
          // Check for duplicates and add new queued messages
          const existingIds = new Set(prev.map(msg => msg.id));
          const newQueuedMessages = queuedMessages.filter(msg => !existingIds.has(msg.id));
          
          if (newQueuedMessages.length === 0) {
            return prev;
          }
          
          const updated = [...prev, ...newQueuedMessages];
          console.log('Added queued messages to state:', newQueuedMessages.length);
          return updated.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        });
      }
    } catch (error) {
      console.error('Failed to fetch queued messages:', error);
    }
  }, [userMetadata.chatId, userMetadata.userId, authenticatedFetch]);

  // Mark a queued message as delivered via REST API
  const markQueuedMessageAsDelivered = useCallback(async (messageId) => {
    try {
      console.log('markQueuedMessageAsDelivered: Marking message as delivered:', messageId);
      
      const response = await fetch(`/api/chat/queued-messages/${messageId}/delivered`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        console.warn('markQueuedMessageAsDelivered: Failed to mark message as delivered:', response.status);
        return false;
      }
      
      console.log('markQueuedMessageAsDelivered: Successfully marked message as delivered:', messageId);
      return true;
    } catch (error) {
      console.error('markQueuedMessageAsDelivered: Error marking message as delivered:', error);
      return false;
    }
  }, []);

  // Periodic check for optimistic messages to help with debugging
  useEffect(() => {
    if (!isConnected || messages.length === 0) return;
    
    const optimisticMessages = messages.filter(msg => msg.isOptimistic);
    if (optimisticMessages.length === 0) return;
    
    const interval = setInterval(() => {
      const stillOptimistic = messages.filter(msg => msg.isOptimistic);
      if (stillOptimistic.length > 0) {
        console.log('WebSocket: Debug - Still have optimistic messages after delay:', stillOptimistic.length);
        stillOptimistic.forEach(msg => {
          console.log('WebSocket: Debug - Optimistic message details:', {
            id: msg.id,
            content: msg.content,
            timestamp: msg.timestamp,
            age: Date.now() - new Date(msg.timestamp).getTime()
          });
        });
        
        // Check if we have timeouts for these messages
        stillOptimistic.forEach(msg => {
          const hasTimeout = optimisticTimeouts.current.has(msg.id);
          console.log('WebSocket: Debug - Message timeout status:', {
            messageId: msg.id,
            hasTimeout,
            timeoutId: optimisticTimeouts.current.get(msg.id)
          });
        });
      }
    }, 5000); // Check every 5 seconds
    
    return () => clearInterval(interval);
  }, [isConnected, messages]);

  // Database-driven state management: trust the database as source of truth
  // State sync only happens on natural interaction points via WebSocket getCurrentState

  // Send message with optimistic updates
  const sendMessageOptimistic = useCallback(async (content) => {
    console.log('sendMessageOptimistic: Starting with content:', content);
    console.log('sendMessageOptimistic: wsActions:', !!wsActions, 'userMetadata.chatId:', userMetadata.chatId);
    console.log('sendMessageOptimistic: WebSocket connection status:', {
      isConnected,
      wsClient: !!wsClient,
      wsActions: !!wsActions
    });
    
    if (!wsActions || !userMetadata.chatId) {
      throw new Error('WebSocket not ready or no active chat');
    }

    if (!isConnected) {
      throw new Error('WebSocket is not connected');
    }

    const messageId = generateOptimisticId();
    const timestamp = new Date().toISOString();
    
    console.log('sendMessageOptimistic: Generated messageId:', messageId);
    console.log('sendMessageOptimistic: Generated timestamp:', timestamp);
    
    // Create optimistic message
    const optimisticMessage = {
      id: messageId,
      content,
      senderId: userProfile.userId,
      timestamp,
      isOptimistic: true
    };

    console.log('sendMessageOptimistic: Created optimistic message:', optimisticMessage);

    // Add optimistic message to UI immediately
    setMessages(prev => {
      console.log('sendMessageOptimistic: Adding optimistic message to UI. Previous messages:', prev);
      const updated = [...prev, optimisticMessage];
      console.log('sendMessageOptimistic: Updated messages with optimistic:', updated);
      return updated;
    });

    // Set up timeout to remove optimistic message if not confirmed within 30 seconds (increased from 10)
    const timeoutId = setTimeout(() => {
      console.warn('sendMessageOptimistic: Timeout reached for message:', messageId);
      console.warn('sendMessageOptimistic: Checking if message still exists and is optimistic...');
      
      setMessages(prev => {
        const messageExists = prev.find(msg => msg.id === messageId);
        console.warn('sendMessageOptimistic: Message exists:', !!messageExists);
        console.warn('sendMessageOptimistic: Message is optimistic:', messageExists?.isOptimistic);
        
        if (messageExists && messageExists.isOptimistic) {
          console.log('sendMessageOptimistic: Removing optimistic message due to timeout:', messageId);
          
          // Instead of removing the message, mark it as failed and keep it visible
          const updated = prev.map(msg => 
            msg.id === messageId 
              ? { ...msg, isOptimistic: false, isFailed: true, failedAt: new Date().toISOString() }
              : msg
          );
          
          console.log('sendMessageOptimistic: Messages after marking as failed:', updated);
          return updated;
        } else {
          console.log('sendMessageOptimistic: Message was already confirmed or does not exist, no action needed');
        }
        return prev;
      });
      
      // Clean up timeout reference
      optimisticTimeouts.current.delete(messageId);
      console.warn('sendMessageOptimistic: Timeout cleanup completed for message:', messageId);
      
      // Log warning about potential WebSocket confirmation issue
      console.warn('sendMessageOptimistic: WARNING - Message confirmation not received within timeout period');
      console.warn('sendMessageOptimistic: This may indicate a WebSocket communication issue');
      console.warn('sendMessageOptimistic: Message ID:', messageId, 'Content:', content);
    }, 30000); // 30 second timeout

    // Store timeout reference
    optimisticTimeouts.current.set(messageId, timeoutId);

    try {
      console.log('🚀 sendMessageOptimistic: === SENDING MESSAGE TO BACKEND ===');
      console.log('sendMessageOptimistic: Current connection status:', isConnected);
      console.log('sendMessageOptimistic: Connection stability:', connectionStabilityRef.current);
      console.log('sendMessageOptimistic: WebSocket client exists:', !!wsClient);
      console.log('sendMessageOptimistic: WebSocket actions exists:', !!wsActions);
      console.log('sendMessageOptimistic: User metadata:', userMetadata);
                console.log('🔑 CONNECTION ID TRACKING:');
          console.log('sendMessageOptimistic: Sender connectionId:', userMetadata?.connectionId);
          console.log('sendMessageOptimistic: Backend should find receiver connectionId and send message there');
          console.log('🚨 KNOWN ISSUE: Backend may have stale receiver connectionId causing GoneException 410 errors');
          console.log('sendMessageOptimistic: If receiver gets 410 errors, their connectionId needs refresh');
      console.log('sendMessageOptimistic: Message payload:', {
        chatId: userMetadata.chatId,
        messageId,
        content,
        sentAt: timestamp
      });
      console.log('sendMessageOptimistic: Sending timestamp:', new Date().toISOString());
      
      // Send message via WebSocket
      console.log('sendMessageOptimistic: Calling wsActions.sendMessage...');
      await wsActions.sendMessage({
        chatId: userMetadata.chatId,
        messageId,
        content,
        sentAt: timestamp
      });

      console.log('✅ sendMessageOptimistic: Message sent successfully to backend!');
      console.log('sendMessageOptimistic: Waiting for confirmation from backend...');
      console.log('sendMessageOptimistic: Expected confirmation action: messageConfirmed');
      console.log('sendMessageOptimistic: Expected confirmation messageId:', messageId);
      console.log('🚀 sendMessageOptimistic: === MESSAGE SEND COMPLETED ===');
      
      // The message will be confirmed via the 'messageConfirmed' WebSocket action
      // No need to mark it as confirmed here
    } catch (error) {
      console.error('sendMessageOptimistic: Error sending message:', error);
      console.error('sendMessageOptimistic: Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      // Clear the timeout since we're handling the error
      clearTimeout(timeoutId);
      optimisticTimeouts.current.delete(messageId);
      
      // Mark optimistic message as failed instead of removing it
      setMessages(prev => {
        console.log('sendMessageOptimistic: Marking optimistic message as failed due to error. Previous messages:', prev);
        const updated = prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, isOptimistic: false, isFailed: true, failedAt: new Date().toISOString(), error: error.message }
            : msg
        );
        console.log('sendMessageOptimistic: Messages after marking as failed:', updated);
        return updated;
      });
      throw error;
    }
  }, [wsActions, userMetadata.chatId, userProfile?.userId, isConnected, wsClient]);

  // Start new chat
  const startNewChat = useCallback(async () => {
    if (!wsActions || !userProfile?.userId) {
      throw new Error('WebSocket not ready or user not loaded');
    }

    try {
      // Refresh state before starting new conversation to ensure we have latest data
      console.log('🔄 startNewChat: Refreshing state before matchmaking');
      await wsActions.getCurrentState({ userId: userProfile.userId });
      
      // Small delay to ensure state is processed
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('🔄 startNewChat: Starting conversation with refreshed state');
      
      // Create a promise that will be resolved by the WebSocket message handler
      const matchmakingPromise = new Promise((resolve, reject) => {
        // Set a timeout to reject the promise if no response is received
        const timeout = setTimeout(() => {
          reject(new Error('Matchmaking timeout - no response received'));
        }, 30000); // 30 second timeout
        
        // Store the promise in state so the WebSocket message handler can access it
        setMatchmakingPromise({ resolve, reject, timeout });
      });
      
      // Send the startConversation WebSocket message
      await wsActions.startConversation({ userId: userProfile.userId });
      
      // Wait for the promise to resolve (this happens when the WebSocket response comes back)
      const result = await matchmakingPromise;
      
      // Clear the promise from state
      setMatchmakingPromise(null);
      
      return result;
    } catch (error) {
      // Clear the promise from state on error
      setMatchmakingPromise(null);
      console.error('Failed to start new chat:', error);
      throw error;
    }
  }, [wsActions, userProfile?.userId]);

  // End current chat
  const endChat = useCallback(async (chatId) => {
    if (!wsActions || !userProfile?.userId) {
      throw new Error('WebSocket not ready or user not loaded');
    }

    try {
      console.log('🔥 WebSocket: endChat called with chatId:', chatId || userMetadata.chatId);
      console.log('🔥 WebSocket: Current userMetadata before ending:', userMetadata);
      console.log('🔥 WebSocket: Current hasActiveChat before ending:', hasActiveChat);
      
      await wsActions.endConversation({
        userId: userProfile.userId,
        chatId: chatId || userMetadata.chatId,
        endReason: 'user_ended'
      });
      
      console.log('🔥 WebSocket: endConversation WebSocket action completed');
      
      // Immediately clear local state for the user who initiated the end
      // Database updates are atomic and other user will get updates on next interaction
      console.log('WebSocket: Clearing local state after ending conversation');
      setHasActiveChat(false);
      setUserMetadata(prev => ({
        ...prev,
        chatId: null,
        ready: false,
        questionIndex: 0
      }));
      
      // Clear conversation metadata
      setConversationMetadata(initialConversationMetadata);
      
      // Clear any messages from the ended conversation
      setMessages([]);
      
      // Clear optimistic timeouts
      optimisticTimeouts.current.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      optimisticTimeouts.current.clear();
      
      console.log('WebSocket: Local state cleared successfully after ending conversation');
    } catch (error) {
      console.error('Failed to end chat:', error);
      throw error;
    }
  }, [wsActions, userProfile?.userId, userMetadata.chatId]);

  // Enhanced chat validation with fallback
  const validateChatAccess = useCallback(async (chatId) => {
    try {
      const response = await apiClient.validateChatAccess(chatId);
      return response.hasAccess || false;
    } catch (error) {
      console.error('Failed to validate chat access:', error);
      
      // Fallback: Check if user has this chat in their metadata
      if (userMetadata.chatId === chatId) {
        console.log('Falling back to local metadata for chat validation');
        return true;
      }
      
      return false;
    }
  }, [userMetadata.chatId]);

  // Initialize WebSocket connection
  const initializeWebSocketConnection = useCallback(async (userId) => {
    if (!userId) return;

    try {
      console.log('initializeWebSocketConnection: Starting...');
      console.log('Current connection state - wsActions:', !!wsActions, 'isConnected:', isConnected);
      console.log('firebaseReady:', firebaseReady, 'wsClient:', !!wsClient);
      
      // Check if Firebase is configured before making API calls
      const auth = getAuth();
      if (!auth.currentUser) {
        console.error('initializeWebSocketConnection: No authenticated user found');
        throw new Error('No authenticated user');
      }

      console.log('initializeWebSocketConnection: Firebase user found:', auth.currentUser.uid);

      console.log('Initializing WebSocket connection...');
      console.log('wsActions available:', !!wsActions);
      
      // Initialize WebSocket connection
      if (wsActions) {
        console.log('Calling wsActions.connect...');
        // Let the WebSocketClient handle authentication automatically
        await wsActions.connect();
        console.log('wsActions.connect completed');
        
        // After connection is established, get current state from backend
        console.log('Getting current state from backend...');
        await wsActions.getCurrentState({ userId });
        console.log('getCurrentState request sent');
        
        // The connection state is now handled by the onConnectionStateChange callback
        // No need to manually check isConnected here since it's updated via the callback
        console.log('WebSocket connection established successfully');
        
        // Set up connection heartbeat to ensure we stay connected
        console.log('Setting up connection heartbeat...');
        setupConnectionHeartbeat();
        
      } else {
        console.warn('wsActions not available for WebSocket connection');
        console.warn('This might be a timing issue - waiting for initialization...');
        throw new Error('WebSocket actions not initialized');
      }
      
      setInitState(prev => ({ ...prev, wsConnected: true }));
      console.log('WebSocket connection initialized successfully');
    } catch (error) {
      console.error('Failed to initialize WebSocket connection:', error);
      setInitState(prev => ({ 
        ...prev, 
        wsConnected: false,
        error: error.message 
      }));
      throw error;
    }
  }, [wsActions, isConnected, firebaseReady, wsClient]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsClient) {
        wsClient.disconnect();
      }
    };
  }, [wsClient]);





  const invalidateCache = useCallback(async (dataType) => {
    switch (dataType) {
      case 'messages':
        if (userMetadata.chatId) {
          loadInitialMessages(userMetadata.chatId);
        }
        break;
      case 'userProfile':
        apiClient.getCurrentUserProfile()
          .then(setUserProfile)
          .catch(console.error);
        break;
      case 'chatContext':
        if (wsActions && userMetadata.chatId) {
          wsActions.syncConversation({ chatId: userMetadata.chatId }).catch((error) => {
            console.error('Failed to sync conversation:', error);
            // Don't show error to user for sync failures - they might be expected
            // Just log for debugging purposes
          });
        }
        break;
    }
  }, [userMetadata.chatId, wsActions, loadInitialMessages]);

  // Retry a failed message
  const retryFailedMessage = useCallback(async (messageId) => {
    try {
      console.log('Retrying failed message:', messageId);
      
      // Find the failed message
      const failedMessage = messages.find(msg => msg.id === messageId && msg.isFailed);
      if (!failedMessage) {
        console.error('Failed message not found:', messageId);
        return;
      }
      
      console.log('Found failed message to retry:', failedMessage);
      
      // Mark as retrying
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, isRetrying: true, retryCount: (msg.retryCount || 0) + 1 }
          : msg
      ));
      
      // Try to send the message again
      await sendMessageOptimistic(failedMessage.content);
      
      // Remove the failed message since it's now being retried
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
      
      console.log('Failed message retry initiated successfully');
    } catch (error) {
      console.error('Failed to retry message:', error);
      
      // Mark as failed again
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, isRetrying: false, error: error.message }
          : msg
      ));
    }
  }, [messages, sendMessageOptimistic]);

  // Manual confirmation check for debugging
  const checkMessageConfirmation = useCallback(async (messageId) => {
    try {
      console.log('Manually checking message confirmation for:', messageId);
      
      // Find the message
      const message = messages.find(msg => msg.id === messageId);
      if (!message) {
        console.error('Message not found:', messageId);
        return;
      }
      
      console.log('Message found:', message);
      
      if (message.isOptimistic) {
        console.log('Message is still optimistic, checking backend...');
        
        // Try to check if the message exists in the backend
        // This is a fallback mechanism
        try {
          const response = await authenticatedFetch(`/api/chat/${userMetadata.chatId}/messages?limit=100`);
          const backendMessages = response.messages || [];
          
          // Check if we can find a matching message by content and timestamp
          const matchingMessage = backendMessages.find(msg => 
            msg.content === message.content && 
            msg.senderId === message.senderId &&
            Math.abs(new Date(msg.timestamp) - new Date(message.timestamp)) < 10000 // Within 10 seconds
          );
          
          if (matchingMessage) {
            console.log('Found matching message in backend:', matchingMessage);
            console.log('Marking optimistic message as confirmed manually');
            
            // Mark as confirmed
            setMessages(prev => prev.map(msg => 
              msg.id === messageId 
                ? { ...msg, isOptimistic: false, confirmedAt: new Date().toISOString(), manuallyConfirmed: true }
                : msg
            ));
            
            // Clear timeout
            const timeoutId = optimisticTimeouts.current.get(messageId);
            if (timeoutId) {
              clearTimeout(timeoutId);
              optimisticTimeouts.current.delete(messageId);
              console.log('Cleared timeout for manually confirmed message:', messageId);
            }
          } else {
            console.log('No matching message found in backend, message may still be processing');
          }
        } catch (error) {
          console.error('Failed to check backend for message confirmation:', error);
        }
      } else {
        console.log('Message is not optimistic, no action needed');
      }
    } catch (error) {
      console.error('Error checking message confirmation:', error);
    }
  }, [messages, userMetadata.chatId, authenticatedFetch]);

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => {
      setNetworkStatus(prev => ({ ...prev, isOnline: true }));
      console.log('Network back online, attempting reconnection');
      
      // Only attempt to reconnect if not already connected and not already connecting
      if (!isConnected && wsClient && !wsClient.isConnecting) {
        console.log('Attempting WebSocket reconnection after network recovery');
        wsClient.connect().catch(console.error);
      } else {
        console.log('WebSocket already connected or connecting, skipping reconnection');
      }
    };
    
    const handleOffline = () => {
      setNetworkStatus(prev => ({ ...prev, isOnline: false }));
      console.log('Network offline detected');
    };
    
    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, [isConnected, wsClient]);

  // Cleanup optimistic timeouts on unmount
  useEffect(() => {
    return () => {
      // Clear all pending timeouts
      optimisticTimeouts.current.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      optimisticTimeouts.current.clear();
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ 
      wsClient,
      wsActions,
      isConnected,
      userMetadata,
      conversationMetadata,
      userProfile,
      messages,
      initState,
      hasActiveChat,
      isLoadingMessages,
      hasMoreMessages,
      otherUserPresence,
      typingStatus,
      networkStatus,
      firebaseReady,
      initializeUser,
      startNewChat,
      endChat,
      loadMoreMessages,
      sendMessageOptimistic,
      validateChatAccess,
      resetInitialization,
      invalidateCache,
      fetchQueuedMessages,
      markQueuedMessageAsDelivered,
      retryFailedMessage,
      checkMessageConfirmation
    }}>
      {children}
    </WebSocketContext.Provider>
  );
}; 
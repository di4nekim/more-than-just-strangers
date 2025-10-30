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

import { useFirebaseAuth } from '../app/components/auth/FirebaseAuthProvider';

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
  // Get Firebase auth state from the FirebaseAuthProvider
  const { user: firebaseUser, isInitialized: firebaseInitialized } = useFirebaseAuth();
  
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
  const lastSentActionRef = useRef(null);
  const loadedChatsRef = useRef(new Set()); // Track which chats have had messages loaded
  const wsActionsRef = useRef(wsActions);

  useEffect(() => {
    matchmakingPromiseRef.current = matchmakingPromise;
    userMetadataRef.current = userMetadata;
    wsActionsRef.current = wsActions;
  }, [matchmakingPromise, userMetadata, wsActions]);

  // Load initial message history via WebSocket
  const loadInitialMessages = useCallback(async (chatId, limit = 50) => {
    // Prevent duplicate requests for the same chat
    if (isLoadingMessages) {
      // // console.log('Already loading messages, skipping duplicate request');
      return;
    }

    // Check if we've already loaded messages for this chat
    if (loadedChatsRef.current.has(chatId)) {
      // // console.log('Messages already loaded for chat:', chatId, 'skipping duplicate load');
      return;
    }

    const currentWsActions = wsActionsRef.current;
    // // console.log('loadInitialMessages: wsActions available:', !!currentWsActions);
    // // console.log('loadInitialMessages: isConnected:', isConnected);
    
    // If WebSocket actions are not available, wait a bit and retry
    if (!currentWsActions) {
//       // console.log('WebSocket actions not available, scheduling retry in 1 second...');
      setTimeout(() => {
//         // console.log('Retrying loadInitialMessages after WebSocket actions delay');
        loadInitialMessages(chatId, limit);
      }, 1000);
      return;
    }

    try {
      setIsLoadingMessages(true);
//       // console.log('Loading initial messages via WebSocket for chatId:', chatId);
      
      // Use WebSocket to fetch chat history
      lastSentActionRef.current = 'fetchChatHistory';
      await currentWsActions.fetchChatHistory({
        chatId,
        limit
      });
      
      // Clear the action ref after a timeout to prevent stale error detection
      setTimeout(() => {
        if (lastSentActionRef.current === 'fetchChatHistory') {
          lastSentActionRef.current = null;
        }
      }, 10000); // 10 seconds timeout
      
      // The messages will be received via the 'chatHistory' message handler
      // which will update the messages state
    } catch (error) {
      console.error('Failed to load initial messages via WebSocket:', error);
      // Remove from loaded chats on WebSocket error so REST API can be tried
      loadedChatsRef.current.delete(chatId);
      
      // Fallback to REST API if WebSocket fails
      try {
        const response = await authenticatedFetch(`/api/chat/${chatId}/messages?limit=${limit}`);
        
        const fetchedMessages = response.messages || [];
        
        setMessages(prev => mergeOptimisticMessages(prev, fetchedMessages));
        
        setHasMoreMessages(response.hasMore || false);
        
        if (fetchedMessages.length > 0) {
          lastMessageTimestamp.current = fetchedMessages[0]?.timestamp;
        }
        
        // Mark this chat as loaded only on successful REST API fallback
        loadedChatsRef.current.add(chatId);
      } catch (restError) {
        console.error('Failed to load initial messages via REST API fallback:', restError);
      }
    } finally {
      setIsLoadingMessages(false);
    }
  }, [isLoadingMessages]); // Remove wsActions from dependencies to prevent recreation

  // Load messages when userMetadata.chatId changes (for page refresh scenarios)
  useEffect(() => {
    if (userMetadata.chatId && messages.length === 0 && !isLoadingMessages) {
//       // console.log('User metadata has chatId but no messages loaded, loading messages:', userMetadata.chatId);
      loadInitialMessages(userMetadata.chatId).catch(error => {
        console.error('Failed to load messages for userMetadata chatId:', error);
      });
    }
  }, [userMetadata.chatId, messages.length, isLoadingMessages, loadInitialMessages]);

  // Fallback: If initialization completes but we have no messages and there's a chat ID from URL, try to load messages
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      // Only run this fallback if:
      // 1. We're not currently initializing
      // 2. We have no messages loaded
      // 3. We're not currently loading messages
      // 4. We have user profile loaded
      // 5. There's a chat ID available (either from metadata or URL)
      if (!initState.isInitializing && 
          messages.length === 0 && 
          !isLoadingMessages && 
          userProfile?.userId) {
        
        const chatIdFromUrl = typeof window !== 'undefined' ? 
          decodeURIComponent(window.location.pathname.split('/').pop()) : null;
        
        const chatIdToUse = userMetadata.chatId || 
                           (chatIdFromUrl && chatIdFromUrl.includes('#') ? chatIdFromUrl : null);
        
        if (chatIdToUse && !loadedChatsRef.current.has(chatIdToUse)) {
//           // console.log('Fallback: Attempting to load messages for chat:', chatIdToUse);
          loadInitialMessages(chatIdToUse).catch(error => {
            console.error('Fallback message loading failed:', error);
          });
        }
      }
    }, 5000); // Wait 5 seconds after initialization completes

    return () => clearTimeout(timeoutId);
  }, [initState.isInitializing, messages.length, isLoadingMessages, userProfile?.userId, userMetadata.chatId, loadInitialMessages]);

  /**
   * Set up WebSocket message handlers
   * @param {WebSocketClient} wsClient
   */
  const setupMessageHandlers = useCallback((wsClient) => {
//     // console.log('WebSocket: Setting up message handlers...');
//     // console.log('WebSocket: wsClient available:', !!wsClient);
//     // console.log('WebSocket: Setting up currentState handler...');
    
    // Handle current state response (for reconnection/refresh)
    wsClient.onMessage('currentState', (data) => {
//       // console.log('WebSocket: Received currentState response:', data);
//       // console.log('WebSocket: Setting user metadata with chatId:', data.chatId);
//       // console.log('WebSocket: Setting hasActiveChat to:', !!data.chatId);
//       // console.log('WebSocket: Full currentState data received:', JSON.stringify(data, null, 2));
      
      setUserMetadata(prev => {
        // Only update if something actually changed
        if (prev.userId === data.userId &&
            prev.connectionId === data.connectionId &&
            prev.chatId === data.chatId &&
            prev.ready === data.ready &&
            prev.questionIndex === data.questionIndex &&
            prev.lastSeen === data.lastSeen &&
            prev.createdAt === data.createdAt) {
          return prev; // No change, return same reference
        }
        
        // If chatId is changing, clear the loaded chats cache
        if (prev.chatId !== data.chatId) {
//           // console.log('Chat ID changing from', prev.chatId, 'to', data.chatId, 'clearing loaded chats cache');
          loadedChatsRef.current.clear();
          setMessages([]); // Clear messages for the new chat
        }
        
        return {
          ...prev,
          userId: data.userId,
          connectionId: data.connectionId,
          chatId: data.chatId,
          ready: data.ready,
          questionIndex: data.questionIndex,
          lastSeen: data.lastSeen,
          createdAt: data.createdAt
        };
      });
      
      // Set hasActiveChat based on whether user has a chatId
      const hasChat = !!data.chatId;
      setHasActiveChat(prev => prev === hasChat ? prev : hasChat);
//       // console.log('WebSocket: User metadata and hasActiveChat updated to:', hasChat);
      
      // If user has an active chat, load the messages (only if not already loaded for this specific chat)
      if (data.chatId) {
//         // console.log('WebSocket: Chat ID found in currentState:', data.chatId);
//         // console.log('WebSocket: Loaded chats cache:', Array.from(loadedChatsRef.current));
//         // console.log('WebSocket: Current messages count:', messages.length);
//         // console.log('WebSocket: Is loading messages:', isLoadingMessages);
        
        if (!loadedChatsRef.current.has(data.chatId)) {
//           // console.log('WebSocket: Loading messages for active chat:', data.chatId);
          loadInitialMessages(data.chatId).catch(error => {
            console.error('Failed to load messages for active chat:', error);
            // Clear from loaded cache on error to allow retry
            loadedChatsRef.current.delete(data.chatId);
          });
        } else {
//           // console.log('WebSocket: Messages already loaded for chat:', data.chatId, 'skipping duplicate load');
          // But if we have no messages somehow, force reload
          if (messages.length === 0) {
//             // console.log('WebSocket: No messages in state despite being marked as loaded - forcing reload');
            loadedChatsRef.current.delete(data.chatId);
            loadInitialMessages(data.chatId).catch(error => {
              console.error('Failed to force reload messages:', error);
            });
          }
        }
      } else {
//         // console.log('WebSocket: No chat ID in currentState response');
      }
      
      // If user is in matchmaking queue (no chatId but ready is true), restore queue state
      if (!data.chatId && data.ready) {
//         // console.log('WebSocket: Restoring matchmaking queue state');
        // This will be handled by the HomeContent component when it detects the state
      }
    });

    // Handle conversation started response
    wsClient.onMessage('conversationStarted', (data) => {
//       // console.log('WebSocket: Received conversationStarted response:', data);
      
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
          // Update user metadata to reflect ready status
          setUserMetadata(prev => ({
            ...prev,
            ready: true
          }));
          
          matchmakingPromiseRef.current.resolve({
            queued: true,
            message: data.message || 'Added to matchmaking queue'
          });
        } else {
          // Unexpected response
          matchmakingPromiseRef.current.reject(new Error('Unexpected matchmaking response'));
        }
        
        setMatchmakingPromise(null);
        matchmakingPromiseRef.current = null;
      }
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
        
        // Create a more specific error message for common cases
        const errorMessage = data.error || 'WebSocket error';
        const enhancedError = new Error(errorMessage);
        
        // Add specific handling for "already in conversation" errors
        if (errorMessage.includes('already in a conversation')) {
//           // console.log('WebSocket: User attempted to start conversation while already in one, triggering state refresh');
          // Refresh user state to ensure frontend is synchronized with backend
          if (wsActions && userMetadata.userId) {
            wsActions.getCurrentState({ userId: userMetadata.userId }).catch(err => {
              console.error('Failed to refresh user state after conversation error:', err);
            });
          }
        }
        
        matchmakingPromiseRef.current.reject(enhancedError);
        setMatchmakingPromise(null);
        matchmakingPromiseRef.current = null;
      }
    });

    // Handle ready status updated response
    wsClient.onMessage('readyStatusUpdated', (data) => {
//       // console.log('WebSocket: Received readyStatusUpdated response:', data);
//       // console.log('WebSocket: Current userMetadata before update:', userMetadataRef.current);
//       // console.log('WebSocket: Data received - userId:', data.userId, 'ready:', data.ready, 'message:', data.message);
      
      // Update user metadata with new ready status immediately
      setUserMetadata(prev => {
        if (prev.ready === data.ready) {
          return prev; // No change, return same reference
        }
        
        const updated = {
          ...prev,
          ready: data.ready
        };
//         // console.log('WebSocket: Updated userMetadata ready status from', prev.ready, 'to', data.ready);
//         // console.log('WebSocket: Full updated userMetadata:', updated);
        return updated;
      });
      
//       // console.log('WebSocket: Updated ready status to:', data.ready);
    });

    // Handle question advancement when both users are ready
    wsClient.onMessage('advanceQuestion', (data) => {
//       // console.log('WebSocket: Received advanceQuestion response:', data);
//       // console.log('WebSocket: Advancing question index to:', data.questionIndex);
      
      // Update user metadata with new question index and reset ready status
      setUserMetadata(prev => {
        const newReady = data.ready !== undefined ? data.ready : false;
        
        if (prev.questionIndex === data.questionIndex && prev.ready === newReady) {
          return prev; // No change, return same reference
        }
        
        const updated = {
          ...prev,
          questionIndex: data.questionIndex,
          ready: newReady
        };
//         // console.log('WebSocket: Updated questionIndex from', prev.questionIndex, 'to', data.questionIndex);
//         // console.log('WebSocket: Reset ready status to:', updated.ready);
        return updated;
      });
    });

    // Handle presence status updates (reverted to original working version)
    wsClient.onMessage('presenceStatus', (data) => {
//       // console.log('WebSocket: Received presenceStatus response:', data);
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
//       // console.log('WebSocket: Received presenceUpdated event:', data);
      // Update other user's presence status when server sends updates
      if (data.userId && data.status) {
        setOtherUserPresence({
          status: data.status,
          lastSeen: data.timestamp || data.lastSeen
        });
      }
    });

    // Handle other message types as needed
    wsClient.onMessage('message', (data) => {
//       // console.log('WebSocket: Received message:', data);
//       // console.log('WebSocket: Current userMetadata:', userMetadataRef.current);
//       // console.log('WebSocket: Message chatId:', data?.chatId, 'User chatId:', userMetadataRef.current?.chatId);
      
      // Add the received message to the messages state
      if (data && data.chatId === userMetadataRef.current.chatId) {
//         // console.log('WebSocket: Adding message to state:', data);
        const newMessage = {
          id: data.messageId,
          content: data.content,
          senderId: data.senderId,
          timestamp: data.timestamp,
          isOptimistic: false
        };
        setMessages(prev => {
//           // console.log('WebSocket: Previous messages:', prev);
          // Check for duplicates to prevent adding the same message twice
          const exists = prev.some(msg => msg.id === newMessage.id);
          if (exists) {
//             // console.log('WebSocket: Message already exists, skipping duplicate:', newMessage.id);
            return prev;
          }
          const updated = [...prev, newMessage];
//           // console.log('WebSocket: Updated messages:', updated);
          return updated;
        });
      } else {
//         // console.log('WebSocket: Message chatId mismatch or missing data');
//         // console.log('WebSocket: Expected chatId:', userMetadataRef.current?.chatId, 'Received chatId:', data?.chatId);
      }
    });

    wsClient.onMessage('messageReceived', (data) => {
//       // console.log('WebSocket: Received messageReceived:', data);
      // Handle incoming messages (backward compatibility)
      if (data && data.chatId === userMetadataRef.current.chatId) {
        const newMessage = {
          id: data.messageId,
          content: data.content,
          senderId: data.senderId,
          timestamp: data.timestamp,
          isOptimistic: false
        };
        setMessages(prev => [...prev, newMessage]);
      }
    });

    wsClient.onMessage('messageConfirmed', (data) => {
//       // console.log('WebSocket: Received messageConfirmed:', data);
//       // console.log('WebSocket: Current userMetadata:', userMetadataRef.current);
//       // console.log('WebSocket: Data chatId:', data?.chatId);
//       // console.log('WebSocket: Current chatId:', userMetadataRef.current?.chatId);
//       // console.log('WebSocket: ChatId match:', data?.chatId === userMetadataRef.current?.chatId);
      
      // Handle message confirmation from sender's own message
      // More robust chatId checking - also check if messageId exists in current messages
      const hasMatchingMessage = messagesRef.current.some(msg => msg.id === data?.messageId);
      const chatIdMatches = data && data.chatId === userMetadataRef.current?.chatId;
      
//       // console.log('WebSocket: Has matching message:', hasMatchingMessage);
//       // console.log('WebSocket: ChatId matches:', chatIdMatches);
      
      if (data && (chatIdMatches || hasMatchingMessage)) {
//         // console.log('WebSocket: Confirming optimistic message:', data.messageId);
//         // console.log('WebSocket: Current chatId:', userMetadataRef.current?.chatId, 'Message chatId:', data.chatId);
        
        setMessages(prev => {
          const messageToConfirm = prev.find(msg => msg.id === data.messageId);
//           // console.log('WebSocket: Found message to confirm:', messageToConfirm);
          
          const updated = prev.map(msg => 
            msg.id === data.messageId 
              ? { ...msg, isOptimistic: false }
              : msg
          );
//           // console.log('WebSocket: Messages after confirmation:', updated);
          return updated;
        });
        
        // Clear the timeout for the confirmed message
        const timeoutId = optimisticTimeouts.current.get(data.messageId);
        if (timeoutId) {
          clearTimeout(timeoutId);
          optimisticTimeouts.current.delete(data.messageId);
//           // console.log('WebSocket: Cleared timeout for confirmed message:', data.messageId);
        } else {
//           // console.warn('WebSocket: No timeout found for confirmed message:', data.messageId);
        }
      } else {
//         // console.log('WebSocket: Ignoring messageConfirmed - chatId mismatch and no matching message');
//         // console.log('WebSocket: data:', data);
//         // console.log('WebSocket: current chatId:', userMetadataRef.current?.chatId);
//         // console.log('WebSocket: current messages:', messagesRef.current.map(m => ({ id: m.id, isOptimistic: m.isOptimistic })));
      }
    });

    wsClient.onMessage('chatHistory', (data) => {
//       // console.log('WebSocket: Received chat history:', data);
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
//           // console.log('WebSocket: Preserving optimistic messages:', optimisticMessages);
//           // console.log('WebSocket: Loaded chat history messages:', transformedMessages);
          
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
//               // console.log('WebSocket: Found confirmed version of optimistic message, not adding:', optimisticMsg);
            }
          });
          
          // Sort by timestamp to maintain order
          const sortedMessages = allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
//           // console.log('WebSocket: Final messages after combining with optimistic:', sortedMessages);
          return sortedMessages;
        });
        
        setHasMoreMessages(data.hasMore || false);
        
        // Update the last message timestamp for pagination
        if (transformedMessages.length > 0) {
          lastMessageTimestamp.current = transformedMessages[0]?.timestamp;
        }
        
        // Clear retry count on successful chat history load
        setInitState(prev => ({ ...prev, retryCount: 0 }));
        lastSentActionRef.current = null;
        
        // Mark this chat as loaded on successful WebSocket response
        if (userMetadataRef.current.chatId) {
          loadedChatsRef.current.add(userMetadataRef.current.chatId);
        }
        
        // Set loading to false on successful WebSocket response
        setIsLoadingMessages(false);
        
        // Clear any previous errors since we successfully loaded messages
        setInitState(prev => ({
          ...prev,
          error: null
        }));
      }
    });

    wsClient.onMessage('userJoined', (data) => {
//       // console.log('WebSocket: User joined:', data);
      // Handle user joined events
    });

    wsClient.onMessage('userLeft', (data) => {
//       // console.log('WebSocket: User left:', data);
      // Handle user left events
    });

    // Handle server errors that might affect optimistic messages
    wsClient.onMessage('error', (data) => {
//       // console.log('WebSocket: Received error:', data);
      
      // Extract action from error data, with fallback to data.action for backward compatibility
      const action = data?.data?.action || data?.action;
      
      if (action) {
        switch (action) {
          case 'sendMessage':
//             // console.log('WebSocket: Server error for sendMessage action, removing optimistic messages');
            // Remove all optimistic messages since we can't determine which specific one failed
            setMessages(prev => {
              const filtered = prev.filter(msg => !msg.isOptimistic);
//               // console.log('WebSocket: Removed optimistic messages due to server error. Remaining messages:', filtered);
              return filtered;
            });
            
            // Clear all optimistic timeouts
            optimisticTimeouts.current.forEach((timeoutId) => {
              clearTimeout(timeoutId);
            });
            optimisticTimeouts.current.clear();
            break;
            
          case 'fetchChatHistory':
//             // console.log('WebSocket: Server error for fetchChatHistory action:', data.data?.error || data.error);
            // Set loading state to false
            setIsLoadingMessages(false);
            
            // Only set error state if we haven't successfully loaded messages
            if (messagesRef.current.length === 0) {
//               // console.log('WebSocket: No messages loaded, setting error state');
              setInitState(prev => ({
                ...prev,
                error: 'Failed to load chat history. Please try refreshing the page.'
              }));
            } else {
//               // console.log('WebSocket: Messages already loaded, ignoring fetchChatHistory error');
            }
            break;
            
          case 'getCurrentState':
//             // console.log('WebSocket: Server error for getCurrentState action:', data.data?.error || data.error);
            // Don't set a global error state for getCurrentState failures - they're recoverable
//             // console.log('WebSocket: getCurrentState failed, but continuing with initialization');
            break;
            
          default:
//             // console.log('WebSocket: Server error for action:', action, 'Error:', data.data?.error || data.error);
            // Handle other action errors as needed
            break;
        }
      } else {
        // Handle errors without action field (backward compatibility)
//         // console.log('WebSocket: Received error without action field:', data);
        // Set loading state to false for any error
        setIsLoadingMessages(false);
        
        // Check if this is a fetchChatHistory error based on recent actions
        const isFetchChatHistoryError = lastSentActionRef.current === 'fetchChatHistory';
        
        if (isFetchChatHistoryError) {
//           // console.log('WebSocket: Detected fetchChatHistory error from malformed response');
          
          // Try to retry the fetchChatHistory action once
          if (wsActions && userMetadata.chatId && !initState.retryCount) {
//             // console.log('WebSocket: Attempting to retry fetchChatHistory...');
            setInitState(prev => ({ ...prev, retryCount: 1 }));
            
            // Retry after a short delay
            setTimeout(async () => {
              try {
                await wsActions.fetchChatHistory({
                  chatId: userMetadata.chatId,
                  limit: 50
                });
              } catch (retryError) {
                console.error('WebSocket: Retry failed:', retryError);
                // Only set error if no messages were loaded
                if (messagesRef.current.length === 0) {
                  setInitState(prev => ({
                    ...prev,
                    error: 'Failed to load chat history after retry. Please try refreshing the page.'
                  }));
                }
              }
            }, 2000);
          } else {
            // Fallback to REST API if WebSocket retry fails
            if (userMetadata.chatId) {
//               // console.log('WebSocket: Falling back to REST API for chat history');
              loadInitialMessages(userMetadata.chatId).catch(fallbackError => {
                console.error('WebSocket: REST API fallback also failed:', fallbackError);
                // Only set error if no messages were loaded
                if (messagesRef.current.length === 0) {
                  setInitState(prev => ({
                    ...prev,
                    error: 'Failed to load chat history. Please try refreshing the page.'
                  }));
                }
              });
            } else {
              // Only set error if no messages were loaded
              if (messagesRef.current.length === 0) {
                setInitState(prev => ({
                  ...prev,
                  error: 'Failed to load chat history. Please try refreshing the page.'
                }));
              }
            }
          }
        } else {
          // Improved browser I/O error detection and handling
          const detectIOError = () => {
            if (typeof window === 'undefined') return false;
            
            // Check for browser storage quota issues
            try {
              // Test localStorage availability
              const testKey = '__storage_test__';
              localStorage.setItem(testKey, 'test');
              localStorage.removeItem(testKey);
            } catch (storageError) {
//               // console.warn('Browser storage error detected:', storageError.message);
              return storageError.message.includes('QuotaExceededError') || 
                     storageError.message.includes('storage quota') ||
                     storageError.message.includes('Unable to create') ||
                     storageError.message.includes('IO error');
            }
            
            // Check error message content
            const errorText = data?.error || data?.message || '';
            return errorText.includes('IO error') || 
                   errorText.includes('Unable to create writable file') ||
                   errorText.includes('storage quota') ||
                   errorText.includes('QuotaExceededError');
          };
          
          const hasIOError = detectIOError();
          
          // Only set error state if we haven't successfully loaded messages or if it's a critical IO error
          if (messagesRef.current.length === 0 || hasIOError) {
//             // console.log('WebSocket: Setting error state - messages loaded:', messagesRef.current.length, 'hasIOError:', hasIOError);
            setInitState(prev => ({
              ...prev,
              error: hasIOError 
                ? 'Browser storage issue detected. This may be due to:\n• Low disk space\n• Browser cache full\n• Private browsing restrictions\n\nTry clearing browser data or using incognito mode.'
                : 'Connection error occurred. Please try refreshing the page.'
            }));
          } else {
//             // console.log('WebSocket: Messages already loaded, ignoring generic error');
          }
        }
      }
    });
    
//     // console.log('WebSocket: Message handlers set up successfully');
//     // console.log('WebSocket: All message handlers configured');
  }, [loadInitialMessages, wsActions]); // Remove handlePresenceUpdate from dependencies

  // Check for Firebase readiness - now based on FirebaseAuthProvider state
  useEffect(() => {
    if (firebaseInitialized) {
//       // console.log('WebSocketProvider: Firebase is initialized via FirebaseAuthProvider');
      setFirebaseReady(true);
    }
  }, [firebaseInitialized]);

  // Initialize WebSocket client and actions when Firebase is ready AND user is authenticated
  useEffect(() => {
//     // console.log('WebSocketProvider: firebaseReady:', firebaseReady, 'wsClient:', !!wsClient, 'firebaseUser:', !!firebaseUser);
    
    // Only initialize WebSocket when Firebase is ready AND user is authenticated
    if (firebaseReady && !wsClient && firebaseUser) {
      try {
//         // console.log('WebSocketProvider: Initializing WebSocket client...');
        
        // Validate environment variables
        const wsApiUrl = process.env.NEXT_PUBLIC_WEBSOCKET_API_URL;
        if (!wsApiUrl) {
          console.error('WebSocketProvider: NEXT_PUBLIC_WEBSOCKET_API_URL is not configured');
          console.error('WebSocket will not be available. Please set NEXT_PUBLIC_WEBSOCKET_API_URL in your environment variables');
          setInitState(prev => ({ 
            ...prev, 
            error: 'WebSocket API URL not configured - WebSocket features will be disabled. Please set NEXT_PUBLIC_WEBSOCKET_API_URL in your .env.local file.' 
          }));
          return;
        }
        
//         // console.log('WebSocketProvider: Using WebSocket URL:', wsApiUrl);
        
        // Create connection state callback
        const onConnectionStateChange = (connected) => {
//           // console.log('WebSocket connection state changed:', connected);
//           // console.log('WebSocket: Connection details - wsClient:', !!client, 'wsActions:', !!actions);
//           // console.log('WebSocket: Connection state change callback called with connected:', connected);
//           // console.log('WebSocket: Setting isConnected to:', connected);
          setIsConnected(connected);
//           // console.log('WebSocket: isConnected state updated');
        };
        
        const client = new WebSocketClient(wsApiUrl, onConnectionStateChange);
//         // console.log('WebSocketProvider: WebSocketClient created successfully');
        
        const actions = createWebSocketActions(client);
//         // console.log('WebSocketProvider: WebSocket actions created successfully');
        
        // Set up message handlers
        setupMessageHandlers(client);
//         // console.log('WebSocketProvider: Message handlers set up successfully');
        
        setWsClient(client);
        setWsActions(actions);
        
//         // console.log('WebSocketProvider: WebSocket client and actions initialized and set in state');
        
        // Automatically establish the WebSocket connection
//         // console.log('WebSocketProvider: Automatically establishing WebSocket connection...');
        actions.connect().then(() => {
//           // console.log('WebSocketProvider: WebSocket connection established automatically');
        }).catch(error => {
          console.error('WebSocketProvider: Failed to establish WebSocket connection:', error);
        });
      } catch (error) {
        console.error('WebSocketProvider: Failed to initialize WebSocket client:', error);
        setInitState(prev => ({ 
          ...prev, 
          error: `WebSocket initialization failed: ${error.message}` 
        }));
      }
    }
  }, [firebaseReady, wsClient, firebaseUser]);

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
    loadedChatsRef.current.clear(); // Clear loaded chats tracking
  }, []);

  // Initialize complete user session
  const initializeUser = useCallback(async (userId) => {
    if (!userId) return;
    
    // Wait for Firebase to be ready before proceeding
    if (!firebaseReady) {
//       // console.log('WebSocketProvider: Waiting for Firebase to be ready before initializing user...');
      return;
    }
    
    // Wait for WebSocket actions to be available
    if (!wsActions) {
//       // console.log('WebSocketProvider: WebSocket actions not yet available, will retry when ready');
      // Instead of returning, wait a bit and try again
      setTimeout(() => {
//         // console.log('WebSocketProvider: Retrying user initialization...');
        initializeUser(userId);
      }, 1000);
      return;
    }
    
    // Prevent multiple initializations
    if (initState.isInitializing) {
//       // console.log('Initialization already in progress, skipping');
      return;
    }

    // Check if user is already initialized with the same userId
    if (userMetadata.userId === userId && initState.profileLoaded && !initState.error) {
//       // console.log('User already initialized with same userId, skipping');
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
        // Load user profile
        const profile = await apiClient.getCurrentUserProfile();
        if (signal.aborted) throw new Error('Initialization cancelled');
        
        // Defer state updates to prevent render-time updates
        setTimeout(() => {
          setUserProfile(profile);
          setInitState(prev => ({ ...prev, profileLoaded: true }));
        }, 0);

        // Establish WebSocket connection first
        if (!signal.aborted) {
          // Wait for WebSocket actions to be available
          if (!wsActions) {
//             // console.log('Waiting for WebSocket actions to be initialized...');
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

        // Get current state from backend via WebSocket
        if (!signal.aborted && wsActions) {
//           // console.log('Getting current state from backend via WebSocket...');
//           // console.log('WebSocket actions available:', !!wsActions);
//           // console.log('User ID being sent:', userId);
//           // console.log('WebSocket connection state - isConnected:', isConnected, 'wsClient readyState:', wsClient?.ws?.readyState);
          
          // Only try to get current state if WebSocket is actually connected
          if (isConnected && wsClient && wsClient.ws && wsClient.ws.readyState === WebSocket.OPEN) {
            try {
              await wsActions.getCurrentState({ userId });
//               // console.log('getCurrentState request sent successfully');
              
              // Wait a bit for the response to come back
//               // console.log('Waiting for currentState response...');
              await new Promise(resolve => setTimeout(resolve, 2000));
//               // console.log('Finished waiting for currentState response');
              
            } catch (error) {
              console.error('Failed to send getCurrentState request:', error);
              // Don't throw here - continue with initialization even if getCurrentState fails
//               // console.log('Continuing initialization despite getCurrentState failure');
            }
          } else {
//             // console.log('WebSocket not connected yet, skipping getCurrentState for now');
//             // console.log('Connection will be established by initializeWebSocketConnection');
          }
        } else {
//           // console.log('Cannot send getCurrentState - signal aborted:', signal.aborted, 'wsActions available:', !!wsActions);
        }

        // Mark initialization as complete
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
//           // console.log('Firebase not yet configured, retrying in 1 second...');
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
//         // console.log('User initialization was cancelled');
        return;
      }
      
      // Check if it's an authentication error
      if (error.message && (
        error.message.includes('Authentication required') ||
        error.message.includes('No authenticated user') ||
        error.message.includes('Firebase authentication timeout') ||
        error.message.includes('Authentication failed')
      )) {
//         // console.log('Authentication error during initialization:', error.message);
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
//           // console.warn('Heartbeat failed, connection may be stale:', error);
          // If heartbeat fails, try to reconnect
          if (wsActions && userMetadata.userId) {
//             // console.log('Attempting to reconnect due to failed heartbeat...');
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

  // Auto-retry initializeUser when Firebase becomes ready and user is authenticated
  // Commented out to prevent race conditions with HomeContent's initialization
  // useEffect(() => {
  //   const checkAndInitialize = async () => {
  //     if (firebaseReady && userMetadata.userId && !initState.isInitializing && !initState.profileLoaded && !initState.error && firebaseUser) {
  //       try {
  //         // Verify the user is fully authenticated by getting a token
  //         try {
  //           const token = await firebaseUser.getIdToken();
  //           if (token) {
  //             // console.log('User is authenticated, initializing user session...');
  //             initializeUser(userMetadata.userId);
  //           } else {
  //             // console.log('User not fully authenticated yet, waiting...');
  //           }
  //         } catch (tokenError) {
  //           // console.log('User authentication not ready yet, waiting...');
  //         }
  //       } catch (error) {
  //         // console.log('Firebase auth check failed, waiting...');
  //         }
  //     }
  //   };

  //   checkAndInitialize();
  // }, [firebaseReady, userMetadata.userId, initState.isInitializing, initState.profileLoaded, initState.error, initializeUser, firebaseUser]);

  // Handle user sign-out - disconnect WebSocket and reset state
  useEffect(() => {
    if (!firebaseUser && wsClient) {
//       // console.log('User signed out, disconnecting WebSocket and resetting state');
      wsClient.disconnect();
      setWsClient(null);
      setWsActions(null);
      setIsConnected(false);
      resetInitialization();
    }
  }, [firebaseUser, wsClient, resetInitialization]);

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

  // Send message with optimistic updates
  const sendMessageOptimistic = useCallback(async (content) => {
//     // console.log('sendMessageOptimistic: Starting with content:', content);
//     // console.log('sendMessageOptimistic: wsActions:', !!wsActions, 'userMetadata.chatId:', userMetadata.chatId);
//     // console.log('sendMessageOptimistic: userProfile:', userProfile);
    
    if (!wsActions || !userMetadata.chatId) {
      throw new Error('WebSocket not ready or no active chat');
    }

    if (!userProfile || !userProfile.userId) {
      throw new Error('User profile not loaded - cannot send message');
    }

    const messageId = generateOptimisticId();
    const timestamp = new Date().toISOString();
    
//     // console.log('sendMessageOptimistic: Generated messageId:', messageId);
//     // console.log('sendMessageOptimistic: Generated timestamp:', timestamp);
    
    // Create optimistic message
    const optimisticMessage = {
      id: messageId,
      content,
      senderId: userProfile.userId,
      timestamp,
      isOptimistic: true
    };

//     // console.log('sendMessageOptimistic: Created optimistic message:', optimisticMessage);

    // Add optimistic message to UI immediately
    setMessages(prev => {
//       // console.log('sendMessageOptimistic: Adding optimistic message to UI. Previous messages:', prev);
      const updated = [...prev, optimisticMessage];
//       // console.log('sendMessageOptimistic: Updated messages with optimistic:', updated);
      return updated;
    });

    // Set up timeout to remove optimistic message if not confirmed within 15 seconds (increased from 10)
    const timeoutId = setTimeout(() => {
//       // console.warn('sendMessageOptimistic: Timeout reached for message:', messageId);
//       // console.warn('sendMessageOptimistic: Checking if message still exists and is optimistic...');
      setMessages(prev => {
        const messageExists = prev.some(msg => msg.id === messageId && msg.isOptimistic);
//         // console.warn('sendMessageOptimistic: Message exists and is optimistic:', messageExists);
        if (messageExists) {
//           // console.log('sendMessageOptimistic: Removing optimistic message due to timeout:', messageId);
          const filtered = prev.filter(msg => msg.id !== messageId);
//           // console.log('sendMessageOptimistic: Messages after timeout removal:', filtered);
          return filtered;
        } else {
//           // console.log('sendMessageOptimistic: Message was already confirmed or does not exist, no removal needed');
        }
        return prev;
      });
      // Clean up timeout reference
      optimisticTimeouts.current.delete(messageId);
//       // console.warn('sendMessageOptimistic: Timeout cleanup completed for message:', messageId);
    }, 15000); // 15 second timeout (increased to give more time for confirmation)

    // Store timeout reference
    optimisticTimeouts.current.set(messageId, timeoutId);

    try {
//       // console.log('sendMessageOptimistic: Sending message via WebSocket...');
      // Send message via WebSocket
      await wsActions.sendMessage({
        chatId: userMetadata.chatId,
        messageId,
        senderId: userProfile.userId,
        content,
        sentAt: timestamp
      });

//       // console.log('sendMessageOptimistic: Message sent successfully, waiting for confirmation from backend');
      // The message will be confirmed via the 'messageConfirmed' WebSocket action
      // No need to mark it as confirmed here
    } catch (error) {
      console.error('sendMessageOptimistic: Error sending message:', error);
      // Clear the timeout since we're handling the error
      clearTimeout(timeoutId);
      optimisticTimeouts.current.delete(messageId);
      
      // Remove optimistic message on error
      setMessages(prev => {
//         // console.log('sendMessageOptimistic: Removing optimistic message due to error. Previous messages:', prev);
        const filtered = prev.filter(msg => msg.id !== messageId);
//         // console.log('sendMessageOptimistic: Messages after error removal:', filtered);
        return filtered;
      });
      throw error;
    }
  }, [wsActions, userMetadata.chatId, userProfile?.userId]);

  // Start new chat
  const startNewChat = useCallback(async () => {
    if (!wsActions || !userProfile?.userId) {
      throw new Error('WebSocket not ready or user not loaded');
    }

    try {
      // Create a promise that will be resolved by the WebSocket message handlers
      const matchmakingPromise = new Promise((resolve, reject) => {
        // Set up timeout for initial WebSocket response (not for matching)
        // This timeout is only for the backend to respond that the user was added to queue
        const timeout = setTimeout(() => {
          console.error('WebSocket: Initial matchmaking response timeout');
          setMatchmakingPromise(null);
          reject(new Error('Failed to connect to matchmaking service'));
        }, 10000); // 10 second timeout for initial response only

        // Store the promise with resolve/reject functions
        const promiseData = {
          resolve,
          reject,
          timeout
        };
        
        setMatchmakingPromise(promiseData);
        matchmakingPromiseRef.current = promiseData;
      });

      // Send the WebSocket message
      await wsActions.startConversation({ userId: userProfile.userId });
      
      // Wait for the WebSocket response (either "queued" or "matched")
      const result = await matchmakingPromise;
      return result;
    } catch (error) {
      console.error('Failed to start new chat:', error);
      // Clean up the promise if it exists
      if (matchmakingPromiseRef.current?.timeout) {
        clearTimeout(matchmakingPromiseRef.current.timeout);
      }
      setMatchmakingPromise(null);
      matchmakingPromiseRef.current = null;
      throw error;
    }
  }, [wsActions, userProfile?.userId]);

  // End current chat
  const endChat = useCallback(async (chatId) => {
    if (!wsActions || !userProfile?.userId) {
      throw new Error('WebSocket not ready or user not loaded');
    }

    try {
      await wsActions.endConversation({
        userId: userProfile.userId,
        chatId: chatId || userMetadata.chatId,
        endReason: 'user_ended'
      });
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
//         // console.log('Falling back to local metadata for chat validation');
        return true;
      }
      
      return false;
    }
  }, [userMetadata.chatId]);

  // Initialize WebSocket connection
  const initializeWebSocketConnection = useCallback(async (userId) => {
    if (!userId) return;

    try {
//       // console.log('initializeWebSocketConnection: Starting...');
//       // console.log('Current connection state - wsActions:', !!wsActions, 'isConnected:', isConnected);
//       // console.log('firebaseReady:', firebaseReady, 'wsClient:', !!wsClient);
      
      // Check if we have an authenticated user from FirebaseAuthProvider
      if (!firebaseUser) {
        console.error('initializeWebSocketConnection: No authenticated user found');
        throw new Error('No authenticated user');
      }

//       // console.log('initializeWebSocketConnection: Firebase user found:', firebaseUser.uid);

//       // console.log('Initializing WebSocket connection...');
//       // console.log('wsActions available:', !!wsActions);
      
      // The WebSocket connection is now established automatically by WebSocketProvider
      // We just need to ensure it's connected and then get the current state
      if (wsActions) {
//         // console.log('WebSocket actions available, checking connection status...');
        
        // Wait for connection to be established if not already connected
        let attempts = 0;
        const maxAttempts = 30; // 30 * 100ms = 3 seconds
        
        while (!isConnected && attempts < maxAttempts) {
//           // console.log(`Waiting for WebSocket connection... (attempt ${attempts + 1}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        if (!isConnected) {
//           // console.warn('WebSocket connection not established after waiting');
          // Try to connect explicitly
//           // console.log('Attempting explicit connection...');
          await wsActions.connect();
        }
        
        // After connection is established, get current state from backend
//         // console.log('Getting current state from backend...');
        
        // Wait a bit more to ensure connection is fully established
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Double-check connection is still open before sending
        if (wsClient && wsClient.ws && wsClient.ws.readyState === WebSocket.OPEN) {
          await wsActions.getCurrentState({ userId });
//           // console.log('getCurrentState request sent');
        } else {
//           // console.warn('WebSocket connection not ready for getCurrentState');
          throw new Error('WebSocket connection not ready');
        }
        
//         // console.log('WebSocket connection and state retrieval completed');
        
      } else {
//         // console.warn('wsActions not available for WebSocket connection');
        throw new Error('WebSocket actions not initialized');
      }
      
      setInitState(prev => ({ ...prev, wsConnected: true }));
//       // console.log('WebSocket connection initialized successfully');
    } catch (error) {
      console.error('Failed to initialize WebSocket connection:', error);
      setInitState(prev => ({ 
        ...prev, 
        wsConnected: false,
        error: error.message 
      }));
      throw error;
    }
  }, [wsActions, isConnected, firebaseReady, wsClient, firebaseUser]);

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
          wsActions.syncConversation({ chatId: userMetadata.chatId }).catch(console.error);
        }
        break;
    }
  }, [userMetadata.chatId, wsActions, loadInitialMessages]);

  // Debug function to manually trigger message loading
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.debugForceLoadMessages = (chatId) => {
//         // console.log('DEBUG: Force loading messages for chat:', chatId);
        loadedChatsRef.current.clear();
        setMessages([]);
        return loadInitialMessages(chatId || userMetadata.chatId);
      };

      window.debugGetState = () => ({
        userMetadata,
        messages: messages.length,
        loadedChats: Array.from(loadedChatsRef.current),
        isLoadingMessages,
        hasMoreMessages,
        initState,
        isConnected,
        hasActiveChat
      });
    }

    return () => {
      if (typeof window !== 'undefined') {
        delete window.debugForceLoadMessages;
        delete window.debugGetState;
      }
    };
  }, [loadInitialMessages, userMetadata, messages.length, isLoadingMessages, hasMoreMessages, initState, isConnected, hasActiveChat]);

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => {
      setNetworkStatus(prev => ({ ...prev, isOnline: true }));
//       // console.log('Network back online, attempting reconnection');
      
      // Only attempt to reconnect if not already connected and not already connecting
      if (!isConnected && wsClient && !wsClient.isConnecting) {
//         // console.log('Attempting WebSocket reconnection after network recovery');
        wsClient.connect().catch(console.error);
      } else {
//         // console.log('WebSocket already connected or connecting, skipping reconnection');
      }
    };
    
    const handleOffline = () => {
      setNetworkStatus(prev => ({ ...prev, isOnline: false }));
//       // console.log('Network offline detected');
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
      loadInitialMessages
    }}>
      {children}
    </WebSocketContext.Provider>
  );
}; 
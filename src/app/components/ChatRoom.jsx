// @ts-nocheck
'use client';

import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { useParams, useRouter } from 'next/navigation'; 
import Image from 'next/image';
import { v4 as uuidv4 } from 'uuid';
import { useFirebaseAuth } from '../components/auth/FirebaseAuthProvider';
import questions from '../../questions.json';
import { useWebSocket } from '../../websocket/WebSocketContext';
import { usePresenceSystem } from '../../websocket/presenceSystem';
import { useTypingIndicator } from '../../websocket/typingIndicator';
import { useReconnectionHandler } from '../../websocket/reconnectionHandler';
import { useDebounce } from '../../hooks/useDebounce';
import { logChatIdInfo, normalizeChatId, validateChatIdFormat, sanitizeChatId } from '../../lib/chatIdUtils';

export default function ChatRoom({ chatId: propChatId }) {
  const [error, setError] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatAccessValidated, setChatAccessValidated] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [queuedMessageNotification, setQueuedMessageNotification] = useState(null);

  const { user, isAuthenticated, loading: authLoading } = useFirebaseAuth();
  const router = useRouter();

  const {
    wsClient,
    wsActions,
    isConnected,
    conversationMetadata,
    userMetadata,
    userProfile,
    messages,
    initState,
    hasActiveChat,
    isLoadingMessages,
    hasMoreMessages,
    otherUserPresence,
    typingStatus,
    initializeUser,
    sendMessageOptimistic,
    loadMoreMessages,
    validateChatAccess,
    endChat,
    retryFailedMessage,
    checkMessageConfirmation,
    fetchQueuedMessages
  } = useWebSocket();

  const { updatePresence, setLocalStatus } = usePresenceSystem();
  const { sendTypingStatus, isTyping } = useTypingIndicator();

  const hasNavigatedRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const messageEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const { chatId: encodedChatId } = useParams();
  const chatId = propChatId || (encodedChatId ? decodeURIComponent(Array.isArray(encodedChatId) ? encodedChatId[0] : encodedChatId) : '');
  
  // Log chat ID information for debugging
  useEffect(() => {
    if (chatId) {
      logChatIdInfo(chatId, 'ChatRoom');
      
      // Validate chat ID format
      const validation = validateChatIdFormat(chatId);
      if (!validation.isValid) {
        console.error('ChatRoom: Invalid chat ID format:', validation.error);
        setError(`Invalid chat ID format: ${validation.error}`);
      } else {
        // Clear any previous validation errors
        setError(null);
      }
    }
  }, [chatId]);
  
  const userId = user?.uid || 'userA';

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/signin');
    }
  }, [authLoading, isAuthenticated, router]);

  const [questionIndex, setQuestionIndex] = useState(1);
  const [isFindingMatch, setIsFindingMatch] = useState(true);
  const [isEndingChat, setIsEndingChat] = useState(false);
  const [localReadyState, setLocalReadyState] = useState(false);

  const getParticipantsAsArray = (participants) => {
    if (!participants) return [];
    if (Array.isArray(participants)) return participants;
    if (participants instanceof Set) return [...participants];
    return [];
  };
  
  const participantsArray = getParticipantsAsArray(conversationMetadata.participants);
  const otherUserId = participantsArray.length === 2
    ? participantsArray.find(id => id !== userId) || ''
    : '';

  const prevQuestionIndexRef = useRef(questionIndex);
  
  useLayoutEffect(() => {
    if (userMetadata.questionIndex !== undefined) {
      const newQuestionIndex = userMetadata.questionIndex || 1;
      if (newQuestionIndex !== prevQuestionIndexRef.current) {
        if (process.env.NODE_ENV === 'development') {
          console.log('ChatRoom: questionIndex updated from userMetadata:', { 
            from: prevQuestionIndexRef.current,
            to: newQuestionIndex,
            userId
          });
        }
        setQuestionIndex(newQuestionIndex);
        prevQuestionIndexRef.current = newQuestionIndex;
      }
    }
  }, [userMetadata.questionIndex, userId]);

  const prevReadyRef = useRef(userMetadata.ready);
  useLayoutEffect(() => {
    if (userMetadata.ready !== prevReadyRef.current) {
      console.log('ChatRoom: userMetadata.ready changed from', prevReadyRef.current, 'to', userMetadata.ready);
      console.log('ChatRoom: Full userMetadata:', userMetadata);
      prevReadyRef.current = userMetadata.ready;
      setLocalReadyState(userMetadata.ready);
    }
  }, [userMetadata.ready, userMetadata]);

  useEffect(() => {
    if (userMetadata.ready !== undefined) {
      setLocalReadyState(userMetadata.ready);
    }
  }, [userMetadata.ready]);

  const updateFindingMatchState = useCallback(() => {
    setIsFindingMatch(!hasActiveChat);
  }, [hasActiveChat]);

  useEffect(() => {
    updateFindingMatchState();
  }, [updateFindingMatchState]);

  const updateEndingChatState = useCallback(() => {
    setIsEndingChat(!!conversationMetadata.endedBy);
  }, [conversationMetadata.endedBy]);

  useEffect(() => {
    updateEndingChatState();
  }, [updateEndingChatState]);

  useEffect(() => {
    const initializeAndValidate = async () => {
      if (!userId || hasInitializedRef.current) return;

      try {
        hasInitializedRef.current = true;
        
        await initializeUser(userId);
        
        if (chatId && chatId !== '' && !chatId.includes('undefined')) {
          const hasAccess = await validateChatAccess(chatId);
          if (!hasAccess) {
            setError('You do not have access to this chat.');
            router.push('/');
            return;
          }
          setChatAccessValidated(true);
          
          // Fetch any queued messages that were sent while user was offline
          if (fetchQueuedMessages) {
            console.log('ChatRoom: Fetching queued messages after chat initialization...');
            setTimeout(() => {
              fetchQueuedMessages();
            }, 2000); // Small delay to ensure WebSocket is fully connected
          }
        }
        
        setLocalStatus('online');
        
      } catch (error) {
        console.error('ChatRoom initialization failed:', error);
        setError('Failed to initialize chat. Please try again.');
      }
    };

    if (!authLoading && isAuthenticated()) {
      initializeAndValidate();
    }
  }, [userId, chatId, authLoading, isAuthenticated, initializeUser, validateChatAccess, setLocalStatus, router, fetchQueuedMessages]);

  useEffect(() => {
    if (isConnected && userMetadata.userId && userMetadata.chatId) {
      setLocalStatus('online');
      
      // Fetch any queued messages when connection is established
      if (fetchQueuedMessages && chatAccessValidated) {
        console.log('ChatRoom: Fetching queued messages after WebSocket connection...');
        setTimeout(() => {
          fetchQueuedMessages();
        }, 1000); // Small delay to ensure connection is fully established
      }
    }
  }, [isConnected, userMetadata.userId, userMetadata.chatId, setLocalStatus, fetchQueuedMessages, chatAccessValidated]);

  useReconnectionHandler({
    maxRetries: 5,
    retryInterval: 1000,
    onReconnect: async () => {
      if (wsActions && chatId) {
        try {
          console.log('ChatRoom: Attempting to sync conversation after reconnection...');
          await wsActions.syncConversation({ chatId });
          console.log('ChatRoom: Conversation sync successful after reconnection');
        } catch (error) {
          console.warn('ChatRoom: Failed to sync conversation after reconnection:', error);
          // Don't show error to user - sync failures are often expected during reconnection
          // The conversation will be synced when the user navigates or when other events trigger sync
        }
      }
      setLocalStatus('online');
      
      // Fetch any queued messages after reconnection
      if (fetchQueuedMessages && chatAccessValidated) {
        console.log('ChatRoom: Fetching queued messages after reconnection...');
        setTimeout(() => {
          fetchQueuedMessages();
        }, 2000); // Delay to ensure reconnection is fully established
      }
    },
    onMaxRetriesExceeded: () => {
      setError('Connection lost. Please refresh the page to reconnect.');
    }
  });

  const currentSet = useMemo(() => {
    return questions.sets.find(set =>
      set.questions.some(q => q.index === questionIndex)
    );
  }, [questionIndex]);
  
  const questionText = useMemo(() => {
    return currentSet?.questions.find(q => q.index === questionIndex)?.text;
  }, [currentSet, questionIndex]);

  const scrollToBottom = useCallback(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  const navigateToCongrats = useCallback(() => {
    if (!hasNavigatedRef.current) {
      hasNavigatedRef.current = true;
      router.push('/congrats');
    }
  }, [router]);

  const handleScroll = useCallback(() => {
    if (!chatContainerRef.current) return;
    
    const { scrollTop } = chatContainerRef.current;
    if (scrollTop === 0 && hasMoreMessages && !isLoadingMessages) {
      loadMoreMessages();
    }
  }, [hasMoreMessages, isLoadingMessages, loadMoreMessages]);

  const debouncedScrollHandler = useDebounce(handleScroll, 200);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !isConnected || isSendingMessage) return;

    setIsSendingMessage(true);
    try {
      await sendMessageOptimistic(newMessage);
      setNewMessage('');
      scrollToBottom();
    } catch (error) {
      setError('Failed to send message');
      console.error('Error sending message:', error);
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    sendTypingStatus(true);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      sendTypingStatus(false);
    }, 2000);
  };

  const handleReady = async () => {
    if (!isConnected || !wsActions) {
      console.log('ChatRoom: handleReady - WebSocket not connected or actions not available');
      return;
    }
    
    const newReadyState = !localReadyState;
    
    console.log('ChatRoom: handleReady - Toggling ready status:', { 
      chatId, 
      userId, 
      currentReady: localReadyState,
      newReady: newReadyState 
    });
    
    console.log('ChatRoom: handleReady - WebSocket connection status:', {
      isConnected,
      wsActions: !!wsActions,
      wsClient: !!wsClient
    });
    
    try {
      setLocalReadyState(newReadyState);
      console.log('ChatRoom: handleReady - About to send WebSocket message...');
      await wsActions.sendReadyToAdvance({
        chatId,
        userId,
        ready: newReadyState
      });
      console.log('ChatRoom: handleReady - Ready status toggled successfully to:', newReadyState);
    } catch (error) {
      console.warn('Failed to send ready status:', error);
      setLocalReadyState(!newReadyState);
    }
  };

  const testWebSocket = async () => {
    if (!wsActions) {
      console.log('ChatRoom: testWebSocket - wsActions not available');
      return;
    }
    
    try {
      console.log('ChatRoom: testWebSocket - Sending test message...');
      await wsActions.getCurrentState({ userId });
      console.log('ChatRoom: testWebSocket - Test message sent successfully');
    } catch (error) {
      console.error('ChatRoom: testWebSocket - Error:', error);
    }
  };

  const testSetReady = async () => {
    if (!wsActions) {
      console.log('ChatRoom: testSetReady - wsActions not available');
      return;
    }
    
    try {
      console.log('ChatRoom: testSetReady - Sending setReady test message...');
      await wsActions.sendReadyToAdvance({
        chatId,
        userId,
        ready: false
      });
      console.log('ChatRoom: testSetReady - Test message sent successfully');
    } catch (error) {
      console.error('ChatRoom: testSetReady - Error:', error);
    }
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    return `${month}. ${day} ${year}`;
  };

  const endConversation = async () => {
    try {
      setIsEndingChat(true);
      await endChat(chatId);
      navigateToCongrats();
    } catch (error) {
      setError('Failed to end chat');
      console.error('Error ending chat:', error);
    }
  };

  const cleanup = () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  };

  useEffect(() => {
    if (hasNavigatedRef.current) return;

    if (chatId && (conversationMetadata.endedBy || questionIndex === 36)) {
      hasNavigatedRef.current = true;
      cleanup();
      navigateToCongrats();
    }
  }, [conversationMetadata.endedBy, questionIndex, navigateToCongrats, chatId]);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages.length, scrollToBottom]);

  // Listen for queued messages and show notifications
  useEffect(() => {
    const queuedMessages = messages.filter(msg => msg.isQueued);
    if (queuedMessages.length > 0) {
      const latestQueuedMessage = queuedMessages[queuedMessages.length - 1];
      setQueuedMessageNotification({
        message: `You received ${queuedMessages.length} message${queuedMessages.length > 1 ? 's' : ''} while offline`,
        count: queuedMessages.length,
        timestamp: latestQueuedMessage.timestamp
      });
      
      // Auto-hide notification after 5 seconds
      const timer = setTimeout(() => {
        setQueuedMessageNotification(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [messages]);

  useEffect(() => {
    const chatContainer = chatContainerRef.current;
    if (chatContainer) {
      chatContainer.addEventListener('scroll', debouncedScrollHandler);
      return () => {
        chatContainer.removeEventListener('scroll', debouncedScrollHandler);
      };
    }
  }, [debouncedScrollHandler]);

  useEffect(() => {
    return () => {
      cleanup();
      setLocalStatus('offline');
    };
  }, [setLocalStatus]);

  const groupedMessages = useMemo(() => {
    const groups = {};
    messages.forEach(message => {
      const date = new Date(message.timestamp).toDateString();
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(message);
    });
    
    // Sort messages within each date group by timestamp (oldest first)
    Object.keys(groups).forEach(date => {
      groups[date].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    });
    
    // Sort date groups by date (oldest first) and create a sorted object
    const sortedGroups = {};
    Object.keys(groups)
      .sort((a, b) => new Date(a) - new Date(b))
      .forEach(date => {
        sortedGroups[date] = groups[date];
      });
    
    return sortedGroups;
  }, [messages]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-beige ">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal mx-auto mb-4"></div>
          <p className="text-teal dark:text-teal ">LOADING...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated() || !userId) {
    return null;
  }

  if (initState.isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-beige">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal mx-auto mb-4"></div>
          <p className="text-teal dark:text-teal ">
            {!initState.profileLoaded ? 'LOADING PROFILE...' :
             !initState.chatContextLoaded ? 'LOADING CHAT CONTEXT...' :
             !initState.wsConnected ? 'CONNECTING...' :
             'INITIALIZING CHAT...'}
          </p>
        </div>
      </div>
    );
  }

  if (initState.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-teal dark:bg-teal ">
        <div className="text-center">
          <div className="text-red-600 mb-4">Failed to initialize chat</div>
          <p className="text-teal  dark:text-teal ">{initState.error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-blue-teal text-beige rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isFindingMatch) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-beige">
        <div className="text-xl font-mono mb-4 text-teal uppercase">Finding a match...</div>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-teal relative font-mono">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/CHATROOM_BG.svg"
          alt="Chat Room Background"
          fill
          style={{ objectFit: 'cover' }}
          priority
        />
      </div>

      {/* Left Navigation Bar */}
      <div className="w-16 border-r border-teal flex flex-col items-center py-4 pt-10 space-y-6 relative z-10 group">
        <button className="text-teal hover:text-teal ">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <button 
          onClick={() => router.push('/home')}
          className="text-blue-400 hover:text-teal opacity-0 group-hover:opacity-80 hover:!opacity-100 transition-all duration-200"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </button>
        <button 
          onClick={() => setShowEndDialog(true)}
          className="text-blue-400 hover:text-teal opacity-0 group-hover:opacity-80 hover:!opacity-100 transition-all duration-200"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative z-10 pt-10">
        {/* Top Header with Question */}
        <div className="w-[80%] bg-teal text-beige py-2 px-4 rounded-lg mx-auto  mb-4 flex items-center">
          <div className="text-lg font-semibold mr-4">
            ({questionIndex})
          </div>
          <div className="flex-1 text-center text-lg font-semibold uppercase">
            {questionText || 'LOADING QUESTION...'}
          </div>
          <button 
            onClick={handleReady}
            disabled={!isConnected}
            className={`bg-transparent p-1 rounded-full transition-all duration-200 border-2 border-transparent ${
              localReadyState 
                ? 'text-green-300 hover:border-beige hover:text-beige' 
                : 'hover:border-beige hover:text-beige text-beige'
            }`}
            title={localReadyState ? 'Click to unready' : 'Ready for next question'}
          >
            {localReadyState ? (
              <div className="flex items-center space-x-1">
                <div className="animate-pulse">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <div className="w-2 h-2 bg-green-300 rounded-full animate-pulse"></div>
              </div>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>

        {/* Show waiting indicator when user is ready but waiting for other user */}
        {localReadyState && (
          <div className="w-[50%] mx-auto mb-4 p-3 bg-light-blue border border-teal rounded-lg">
            <div className="flex items-center justify-center space-x-6 text-teal">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-teal"></div>
              <span className="text-sm font-medium uppercase">Waiting for other user to be ready...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="mx-4 mb-4 p-2 bg-red-100 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {/* Debug Section - Only show in development */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mx-4 mb-4 p-3 bg-gray-100 border border-gray-300 rounded-lg">
            <div className="text-sm text-gray-700 mb-2">
              <strong>🔧 Debug Info:</strong>
            </div>
            <div className="text-xs text-gray-600 space-y-1">
              <div>
                <strong>WebSocket:</strong> {isConnected ? '✅ Connected' : '❌ Disconnected'} | 
                <strong> Client:</strong> {wsClient ? '✅' : '❌'} | 
                <strong> Actions:</strong> {wsActions ? '✅' : '❌'}
              </div>
              <div>
                <strong>User:</strong> {userMetadata.userId || 'N/A'} | 
                <strong> Chat:</strong> {userMetadata.chatId || 'N/A'}
              </div>
              <div>
                <strong>Messages:</strong> {messages.length} | 
                <strong> Optimistic:</strong> {messages.filter(m => m.isOptimistic).length} | 
                <strong> Failed:</strong> {messages.filter(m => m.isFailed).length} | 
                <strong> Queued:</strong> {messages.filter(m => m.isQueued).length}
              </div>
              <div>
                <strong>Unique IDs:</strong> {new Set(messages.map(m => m.id)).size} | 
                <strong> Last Update:</strong> {new Date().toLocaleTimeString()}
              </div>
              <div className="border-t pt-1 mt-1 text-blue-600">
                <strong>🚨 WebSocket Debug:</strong> 
                <span id="ws-debug-info" className="ml-2">
                  Raw: <span id="ws-raw-count">-</span> | 
                  Messages: <span id="ws-message-actions">-</span> | 
                  Added: <span id="ws-messages-added">-</span> | 
                  Filtered: <span id="ws-messages-filtered">-</span>
                </span>
              </div>
              <div className="text-xs text-gray-500">
                <strong>Recent Message IDs:</strong> {messages.slice(-3).map(m => m.id.slice(-8)).join(', ')}
              </div>
            </div>
            {messages.filter(m => m.isOptimistic).length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-gray-600">Optimistic Messages:</div>
                {messages.filter(m => m.isOptimistic).map(msg => (
                  <div key={msg.id} className="flex items-center space-x-2 text-xs">
                    <span className="bg-yellow-200 px-2 py-1 rounded">
                      {msg.content.substring(0, 20)}...
                    </span>
                    <button
                      onClick={() => checkMessageConfirmation(msg.id)}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs"
                    >
                      Check Confirmation
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Queued Message Notification */}
        {queuedMessageNotification && (
          <div className="mx-4 mb-4 p-3 bg-orange-100 border border-orange-300 text-orange-800 rounded-lg animate-pulse">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">{queuedMessageNotification.message}</span>
              </div>
              <button
                onClick={() => setQueuedMessageNotification(null)}
                className="text-orange-600 hover:text-orange-800"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Messages Container */}
        <div 
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto px-4 space-y-4"
          role="list"
        >
          {isLoadingMessages && (
            <div className="text-center text-teal ">LOADING MORE MESSAGES...</div>
          )}
          
          {Object.entries(groupedMessages).map(([date, dateMessages]) => (
            <div key={date}>
              {/* Date Separator */}
              <div className="flex items-center justify-center my-6">
                <div className="flex-1 h-px bg-teal "></div>
                <span className="px-4 text-sm font-medium text-teal  uppercase">
                  {formatDate(dateMessages[0].timestamp)}
                </span>
                <div className="flex-1 h-px bg-teal "></div>
              </div>
              
              {/* Messages for this date */}
              {dateMessages.map((message) => {
                const isCurrentUser = message.senderId === userId;
                const userName = isCurrentUser ? 'QUINCEY' : 'JOHNATHAN';
                const textColor = isCurrentUser ? 'text-teal' : 'text-blue-400';
                const bgColor = isCurrentUser ? 'bg-teal' : 'bg-blue-400';
                
                return (
                  <div key={message.id} className="mb-4 mx-10">
                    <div className="flex items-start space-x-2">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className={`font-semibold ${textColor}`}>
                            {userName}
                          </span>
                          <span className={`${bgColor} text-white text-xs px-2 py-[3px] rounded`}>
                            {formatTime(message.timestamp)}
                          </span>
                          {message.isQueued && (
                            <span className="bg-orange-500 text-white text-xs px-2 py-[3px] rounded animate-pulse">
                              QUEUED
                            </span>
                          )}
                          {message.isOptimistic && (
                            <span className="bg-yellow-500 text-white text-xs px-2 py-[3px] rounded animate-pulse">
                              SENDING...
                            </span>
                          )}
                          {message.isFailed && (
                            <div className="flex items-center space-x-2">
                              <span className="bg-red-500 text-white text-xs px-2 py-[3px] rounded">
                                FAILED
                              </span>
                              <button
                                onClick={() => retryFailedMessage(message.id)}
                                className="bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-[3px] rounded transition-colors"
                                title="Retry sending message"
                              >
                                RETRY
                              </button>
                            </div>
                          )}
                          {message.isRetrying && (
                            <span className="bg-blue-500 text-white text-xs px-2 py-[3px] rounded animate-pulse">
                              RETRYING...
                            </span>
                          )}
                        </div>
                        <div className={`${textColor} leading-tight text-sm`}>
                          {message.content}
                        </div>
                        {message.error && (
                          <div className="text-red-500 text-xs mt-1">
                            Error: {message.error}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div ref={messageEndRef} />
        </div>

        {/* Bottom Input Area */}
        <div className="p-4 mb-8 mx-auto w-[90%] border-teal text-teal">
          <form onSubmit={handleSendMessage} className="relative">
            <input
              type="text"
              value={newMessage}
              onChange={handleTyping}
              onBlur={() => sendTypingStatus(false)}
              placeholder="TYPE YOUR REPLY HERE"
              disabled={!isConnected || isSendingMessage}
              className="w-full p-3 pr-12 border border-teal rounded-lg disabled:opacity-50 bg-beige placeholder:text-teal focus:outline-none"
            />
            <button
              type="submit"
              disabled={!isConnected || isSendingMessage || !newMessage.trim()}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-teal hover:bg-teal text-white p-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      {/* Custom End Conversation Dialog */}
      {showEndDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-beige border-2 border-teal rounded-lg p-6 max-w-md mx-4">
            <div className="text-center">
              <h3 className="text-teal font-bold text-lg mb-4 uppercase">
                End Conversation?
              </h3>
              <p className="text-teal mb-6 text-sm uppercase">
                Are you sure you want to end the conversation? This action cannot be undone.
              </p>
              <div className="flex space-x-4 justify-center">
                <button
                  onClick={() => setShowEndDialog(false)}
                  className="px-4 py-2 border border-teal text-teal rounded hover:bg-teal hover:text-beige transition-colors uppercase"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowEndDialog(false);
                    endConversation();
                  }}
                  className="px-4 py-2 bg-teal text-beige rounded hover:bg-opacity-80 transition-colors uppercase"
                >
                  End Conversation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

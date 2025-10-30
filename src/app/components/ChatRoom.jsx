// @ts-nocheck
'use client';

import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect, memo } from 'react';
import { createPortal } from 'react-dom';
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

// Completely isolated input component with its own state management
const IsolatedInput = memo(({ 
  inputRef, 
  onSendMessage,
  placeholder, 
  disabled, 
  className 
}) => {
  const [localValue, setLocalValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  
  const handleChange = useCallback((e) => {
    setLocalValue(e.target.value);
  }, []);
  
  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);
  
  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);
  
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (localValue.trim() && !disabled) {
        onSendMessage(localValue.trim());
        setLocalValue('');
      }
    }
  }, [localValue, disabled, onSendMessage]);
  
  // Update ref value for external access
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = localValue;
    }
  }, [localValue, inputRef]);
  
  return (
    <input
      ref={inputRef}
      type="text"
      value={localValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
    />
  );
});

IsolatedInput.displayName = 'IsolatedInput';

const ChatRoom = memo(function ChatRoom({ chatId: propChatId }) {
  const [error, setError] = useState(null);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatAccessValidated, setChatAccessValidated] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);

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
    endChat
  } = useWebSocket();

  const { updatePresence, setLocalStatus } = usePresenceSystem();
  const { sendTypingStatus, isTyping } = useTypingIndicator();

  const hasNavigatedRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const messageEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const inputRef = useRef(null);

  const { chatId: encodedChatId } = useParams();
  const chatId = propChatId || (encodedChatId ? decodeURIComponent(Array.isArray(encodedChatId) ? encodedChatId[0] : encodedChatId) : '');
  
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
  const [lastSyncTime, setLastSyncTime] = useState(null);

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
//           // console.log('ChatRoom: questionIndex updated from userMetadata:', { 
            from: prevQuestionIndexRef.current,
            to: newQuestionIndex,
            userId
          });
        }
        setQuestionIndex(newQuestionIndex);
        prevQuestionIndexRef.current = newQuestionIndex;
        
        // Reset localReadyState when question advances (fallback mechanism)
        if (localReadyState) {
          setLocalReadyState(false);
        }
      }
    }
  }, [userMetadata.questionIndex, userId, localReadyState]);

  const prevReadyRef = useRef(userMetadata.ready);
  useLayoutEffect(() => {
    if (userMetadata.ready !== prevReadyRef.current) {
//       // console.log('ChatRoom: userMetadata.ready changed from', prevReadyRef.current, 'to', userMetadata.ready);
//       // console.log('ChatRoom: Full userMetadata:', userMetadata);
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
  }, [userId, chatId, authLoading, isAuthenticated, initializeUser, validateChatAccess, setLocalStatus, router]);

  useEffect(() => {
    if (isConnected && userMetadata.userId && userMetadata.chatId) {
      setLocalStatus('online');
    }
  }, [isConnected, userMetadata.userId, userMetadata.chatId, setLocalStatus]);

  useReconnectionHandler({
    maxRetries: 5,
    retryInterval: 1000,
    onReconnect: async () => {
      if (wsActions && chatId) {
        try {
          await wsActions.syncConversation({ chatId });
        } catch (error) {
//           // console.warn('Failed to sync conversation after reconnection:', error);
        }
      }
      setLocalStatus('online');
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

  const handleSendMessage = useCallback(async (messageText) => {
    if (!messageText || !isConnected || isSendingMessage || !userProfile) return;

    setIsSendingMessage(true);
    setError(null); // Clear any previous errors
    try {
      await sendMessageOptimistic(messageText);
      scrollToBottom();
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Provide more specific error messages based on the error type
      if (error.message.includes('User profile not loaded')) {
        setError('User profile not ready. Please wait a moment and try again.');
      } else if (error.message.includes('WebSocket not ready')) {
        setError('Connection not ready. Please check your connection and try again.');
      } else if (error.message.includes('no active chat')) {
        setError('No active chat found. Please refresh the page.');
      } else {
        setError('Failed to send message. Please try again.');
      }
    } finally {
      setIsSendingMessage(false);
    }
  }, [isConnected, isSendingMessage, userProfile, sendMessageOptimistic, scrollToBottom]);

  // Removed old typing and focus handlers - now handled by IsolatedInput

  const handleReady = async () => {
    if (!isConnected || !wsActions) {
//       // console.log('ChatRoom: handleReady - WebSocket not connected or actions not available');
      return;
    }
    
    const newReadyState = !localReadyState;
    
//     // console.log('ChatRoom: handleReady - Toggling ready status:', { 
      chatId, 
      userId, 
      currentReady: localReadyState,
      newReady: newReadyState 
    });
    
//     // console.log('ChatRoom: handleReady - WebSocket connection status:', {
      isConnected,
      wsActions: !!wsActions,
      wsClient: !!wsClient
    });
    
    try {
      setLocalReadyState(newReadyState);
//       // console.log('ChatRoom: handleReady - About to send WebSocket message...');
      await wsActions.sendReadyToAdvance({
        chatId,
        userId,
        ready: newReadyState
      });
//       // console.log('ChatRoom: handleReady - Ready status toggled successfully to:', newReadyState);
    } catch (error) {
//       // console.warn('Failed to send ready status:', error);
      setLocalReadyState(!newReadyState);
    }
  };

  const testWebSocket = async () => {
    if (!wsActions) {
//       // console.log('ChatRoom: testWebSocket - wsActions not available');
      return;
    }
    
    try {
//       // console.log('ChatRoom: testWebSocket - Sending test message...');
      await wsActions.getCurrentState({ userId });
//       // console.log('ChatRoom: testWebSocket - Test message sent successfully');
    } catch (error) {
      console.error('ChatRoom: testWebSocket - Error:', error);
    }
  };

  const testSetReady = async () => {
    if (!wsActions) {
//       // console.log('ChatRoom: testSetReady - wsActions not available');
      return;
    }
    
    try {
//       // console.log('ChatRoom: testSetReady - Sending setReady test message...');
      await wsActions.sendReadyToAdvance({
        chatId,
        userId,
        ready: false
      });
//       // console.log('ChatRoom: testSetReady - Test message sent successfully');
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
    // Cleanup function reserved for future typing indicator implementation
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

  // Initial sync and periodic sync to ensure we have the latest question index
  useEffect(() => {
    if (!isConnected || !wsActions || !userId) return;

    // Initial sync
    const initialSync = async () => {
      try {
//         // console.log('ChatRoom: Initial sync - getting current state');
        await wsActions.getCurrentState({ userId });
        setLastSyncTime(new Date());
      } catch (error) {
//         // console.warn('ChatRoom: Initial sync failed:', error);
      }
    };

    initialSync();

    // Periodic sync every 30 seconds
    const syncInterval = setInterval(async () => {
      try {
//         // console.log('ChatRoom: Periodic sync - getting current state');
        await wsActions.getCurrentState({ userId });
        setLastSyncTime(new Date());
      } catch (error) {
//         // console.warn('ChatRoom: Periodic sync failed:', error);
      }
    }, 30000);

    return () => clearInterval(syncInterval);
  }, [isConnected, wsActions, userId]);

  useEffect(() => {
    const chatContainer = chatContainerRef.current;
    if (chatContainer) {
      chatContainer.addEventListener('scroll', debouncedScrollHandler);
      return () => {
        chatContainer.removeEventListener('scroll', debouncedScrollHandler);
      };
    }
  }, [debouncedScrollHandler]);

  // DISABLED: Auto-focus input when user starts typing anywhere
  // This was causing focus issues - completely disabled
  // useEffect(() => {
  //   const handleGlobalKeyDown = (e) => {
  //     // Don't focus if we're in certain states
  //     if (isFindingMatch || isEndingChat || authLoading || !isAuthenticated() || !userId) {
  //       return;
  //     }
  //     
  //     // Don't focus if already focused on the input or if it's a special key
  //     if (document.activeElement === inputRef.current) {
  //       return;
  //     }
  //     
  //     // Don't focus for modifier keys, function keys, or navigation keys
  //     const specialKeys = [
  //       'Alt', 'Control', 'Meta', 'Shift', 'Tab', 'Escape', 'F1', 'F2', 'F3', 'F4', 
  //       'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'ArrowUp', 'ArrowDown', 
  //       'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Insert', 
  //       'Delete', 'CapsLock', 'ScrollLock', 'NumLock', 'Pause', 'ContextMenu'
  //     ];
  //     
  //     if (specialKeys.includes(e.key)) {
  //       return;
  //     }
  //     
  //     // Focus the input field
  //     if (inputRef.current) {
  //       inputRef.current.focus();
  //     }
  //   };

  //   // Add event listener
  //   document.addEventListener('keydown', handleGlobalKeyDown);
  //   
  //   // Cleanup
  //   return () => {
  //     document.removeEventListener('keydown', handleGlobalKeyDown);
  //   };
  // }, [isFindingMatch, isEndingChat, authLoading, isAuthenticated, userId]);

  // Focus preservation no longer needed - handled by IsolatedInput

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
      <div className="min-h-screen flex items-center justify-center bg-beige font-mono">
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
    const isIOError = initState.error.includes('IO error') || initState.error.includes('Unable to create writable file');
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-beige font-mono">
        <div className="text-center max-w-md">
          <div className="text-teal mb-4 text-xl font-bold">FAILED TO INITIALIZE CHAT</div>
          
          {isIOError ? (
            <div className="text-teal mb-6">
              <p className="mb-4">Browser storage error detected. This is usually caused by:</p>
              <ul className="text-left text-sm space-y-2 mb-4">
                <li>• Low disk space on your device</li>
                <li>• Browser cache/storage corruption</li>
                <li>• Chrome extension conflicts</li>
                <li>• File system permissions</li>
              </ul>
              <p className="text-sm">Try clearing your browser cache or using an incognito window.</p>
            </div>
          ) : (
            <p className="text-teal mb-6">{initState.error}</p>
          )}
          
          <div className="space-y-3">
            <button 
              onClick={() => window.location.reload()} 
              className="w-full px-4 py-2 bg-teal text-beige rounded-lg hover:bg-blue-teal transition-colors"
            >
              Retry
            </button>
            
            {isIOError && (
              <button 
                onClick={() => {
                  // Clear browser storage
                  if (typeof window !== 'undefined') {
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.reload();
                  }
                }} 
                className="w-full px-4 py-2 bg-light-blue text-teal rounded-lg border-2 border-teal hover:bg-teal hover:text-beige transition-colors"
              >
                Clear Storage & Retry
              </button>
            )}
          </div>
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
          className="text-sky-blue hover:text-teal opacity-0 group-hover:opacity-80 hover:!opacity-100 transition-all duration-200"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </button>
        <button 
          onClick={() => setShowEndDialog(true)}
          className="text-sky-blue hover:text-teal opacity-0 group-hover:opacity-80 hover:!opacity-100 transition-all duration-200"
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
          <div className="flex items-center space-x-2">
            <button 
              onClick={async () => {
                try {
//                   // console.log('ChatRoom: Manual refresh - getting current state');
                  await wsActions.getCurrentState({ userId });
                  setLastSyncTime(new Date());
                } catch (error) {
//                   // console.warn('ChatRoom: Manual refresh failed:', error);
                }
              }}
              disabled={!isConnected}
              className="bg-transparent p-1 rounded-full transition-all duration-200 border-2 border-transparent hover:border-beige hover:text-beige text-beige"
              title="Refresh question (in case WebSocket messages failed)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
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
                        </div>
                        <div className={`${textColor} leading-tight text-sm`}>
                          {message.content}
                        </div>
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
          <div className="relative">
            <IsolatedInput
              inputRef={inputRef}
              onSendMessage={handleSendMessage}
              placeholder="TYPE YOUR REPLY HERE"
              disabled={!isConnected || isSendingMessage || !userProfile}
              className="w-full p-3 pr-12 border border-teal rounded-lg disabled:opacity-50 bg-beige placeholder:text-teal focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                const message = inputRef.current?.value?.trim();
                if (message) {
                  handleSendMessage(message);
                  if (inputRef.current) {
                    inputRef.current.value = '';
                  }
                }
              }}
              disabled={!isConnected || isSendingMessage || !userProfile}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-teal hover:bg-teal text-white p-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
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
});

ChatRoom.displayName = 'ChatRoom';

export default ChatRoom;

// @ts-nocheck
'use client';

import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect, useImperativeHandle, memo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation'; 
import Image from 'next/image';
import { useFirebaseAuth } from '../components/auth/FirebaseAuthProvider';
import questions from '../../questions.json';
import { useWebSocket } from '../../websocket/WebSocketContext';
import { usePresenceSystem } from '../../websocket/presenceSystem';
// NOTE: the server has deprecated the `typingStatus` action (the sendMessage
// lambda no-ops on it), so the typing-indicator wiring was removed from this
// screen. src/websocket/typingIndicator.jsx is intentionally left in place.
import { useReconnectionHandler } from '../../websocket/reconnectionHandler';
import { useDebounce } from '../../hooks/useDebounce';

// Copy for the compact connection banner. Anything unrecognised is treated as
// "connecting" so the banner never renders an empty string.
const CONNECTION_BANNERS = {
  reconnecting: 'Reconnecting…',
  connecting: 'Connecting…',
  offline: "You're offline — messages will send when you're back"
};

// Completely isolated input component with its own state management
const IsolatedInput = memo(({
  inputRef,
  controlRef,
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

  // Shared submit path for both the Enter key and the send button so they
  // behave identically and clear the input through React state.
  const handleSubmit = useCallback(() => {
    if (localValue.trim() && !disabled) {
      onSendMessage(localValue.trim());
      setLocalValue('');
    }
  }, [localValue, disabled, onSendMessage]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  // Expose an imperative API so the send button can submit/clear through the
  // same React state the Enter key uses (the DOM-value sync effect below would
  // otherwise re-assert stale text if we cleared the DOM node directly).
  useImperativeHandle(controlRef, () => ({
    submit: handleSubmit,
    clear: () => setLocalValue(''),
  }), [handleSubmit]);

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
    partnerId: contextPartnerId,
    displayNameFor,
    connectionStatus,
    messages,
    initState,
    hasActiveChat,
    isLoadingMessages,
    hasMoreMessages,
    otherUserPresence,
    initializeUser,
    sendMessageOptimistic,
    loadMoreMessages,
    validateChatAccess,
    endChat
  } = useWebSocket();

  const { updatePresence, setLocalStatus } = usePresenceSystem();

  const hasNavigatedRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const messageEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const inputRef = useRef(null);
  const inputControlRef = useRef(null);

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

  // The context owns partner resolution; fall back to the locally derived id so
  // this screen still works against an older/partial context value.
  const partnerId = contextPartnerId || otherUserId || null;

  // Real identities only: the context's displayNameFor never invents a name.
  // If it is unavailable we degrade to the same honest fallbacks rather than
  // rendering a placeholder person.
  const resolveDisplayName = useCallback((someUserId) => {
    if (typeof displayNameFor === 'function') {
      const resolved = displayNameFor(someUserId);
      if (typeof resolved === 'string' && resolved.trim()) return resolved;
    }
    if (someUserId && someUserId === userId) return 'You';
    if (typeof someUserId === 'string' && someUserId.length > 0) return someUserId.slice(0, 8);
    return 'Your match';
  }, [displayNameFor, userId]);

  const partnerName = resolveDisplayName(partnerId);

  // Single derived socket status for the UI. `isConnected` stays the authority
  // for whether an action can be sent; this only drives the feedback copy.
  const effectiveConnectionStatus = connectionStatus || (isConnected ? 'connected' : 'connecting');
  const isConnectionHealthy = effectiveConnectionStatus === 'connected';
  const connectionBanner = isConnectionHealthy
    ? null
    : (CONNECTION_BANNERS[effectiveConnectionStatus] || CONNECTION_BANNERS.connecting);

  // presenceStatus/presenceUpdated deliver {status, lastSeen}; older callers
  // hand over {isOnline}. Accept both so the dot never lies by omission.
  const isPartnerOnline = otherUserPresence?.status === 'online' || otherUserPresence?.isOnline === true;
  const presenceLabel = isPartnerOnline ? 'Online' : 'Offline';

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

    // Navigate to congrats only once the conversation has actually completed:
    // an explicit end event (endedBy), or the final question (36) has been
    // answered and advanced past (the backend increments to 37 when both users
    // ready on Q36). Firing on `=== 36` navigated on ENTERING the last question,
    // before it was answered.
    if (chatId && (conversationMetadata.endedBy || questionIndex > 36)) {
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
    // h-screen is the baseline; 100dvh (progressively enhanced) keeps the sticky
    // composer above the on-screen keyboard on phones.
    <div className="flex flex-col md:flex-row h-screen supports-[height:100dvh]:h-[100dvh] overflow-x-hidden bg-teal relative font-mono">
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

      {/* Navigation: a top bar on phones, the original hover-reveal rail from md up */}
      <div className="w-full md:w-16 shrink-0 border-b md:border-b-0 md:border-r border-teal flex flex-row md:flex-col items-center justify-start gap-6 md:gap-0 px-4 md:px-0 py-3 md:py-4 md:pt-10 md:space-y-6 relative z-10 group">
        <button className="text-teal hover:text-teal shrink-0" aria-label="Menu">
          <svg className="w-7 h-7 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <button
          onClick={() => router.push('/home')}
          aria-label="Go home"
          className="text-sky-blue hover:text-teal shrink-0 opacity-80 md:opacity-0 md:group-hover:opacity-80 md:group-focus-within:opacity-80 focus:!opacity-100 hover:!opacity-100 transition-all duration-200"
        >
          <svg className="w-7 h-7 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </button>
        <button
          onClick={() => setShowEndDialog(true)}
          aria-label="End conversation"
          className="text-sky-blue hover:text-teal shrink-0 opacity-80 md:opacity-0 md:group-hover:opacity-80 md:group-focus-within:opacity-80 focus:!opacity-100 hover:!opacity-100 transition-all duration-200"
        >
          <svg className="w-7 h-7 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 min-h-0 min-w-0 flex flex-col relative z-10 pt-4 md:pt-10">
        {/* Partner identity + presence */}
        <div className="w-full md:w-[80%] mx-auto px-4 md:px-0 mb-2 flex items-center gap-2 text-teal min-w-0">
          <span className="font-semibold uppercase truncate">{partnerName}</span>
          <span
            aria-hidden="true"
            className={`inline-block w-2 h-2 rounded-full shrink-0 ${isPartnerOnline ? 'bg-green-500' : 'bg-gray-400'}`}
          />
          <span className="text-xs uppercase shrink-0">{presenceLabel}</span>
        </div>

        {/* Connection feedback */}
        {connectionBanner && (
          <div
            role="status"
            aria-live="polite"
            className="w-full md:w-[80%] mx-auto mb-2 px-4 py-2 bg-light-blue border border-teal rounded-lg text-teal text-xs sm:text-sm text-center uppercase"
          >
            {connectionBanner}
          </div>
        )}

        {/* Top Header with Question */}
        <div className="w-full md:w-[80%] bg-teal text-beige py-2 px-3 md:px-4 rounded-lg mx-auto mb-3 md:mb-4 flex flex-wrap md:flex-nowrap items-center gap-2 min-w-0">
          <div className="text-base md:text-lg font-semibold md:mr-4 shrink-0">
            ({questionIndex})
          </div>
          <div className="order-last md:order-none w-full md:w-auto md:flex-1 text-center text-base md:text-lg font-semibold uppercase break-words min-w-0">
            {questionText || 'LOADING QUESTION...'}
          </div>
          <div className="flex items-center space-x-2 ml-auto md:ml-0 shrink-0">
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
              aria-label="Refresh question"
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
              aria-label={localReadyState ? 'Click to unready' : 'Ready for next question'}
              aria-pressed={localReadyState}
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
          <div className="w-[92%] md:w-[50%] mx-auto mb-4 p-3 bg-light-blue border border-teal rounded-lg">
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
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 md:px-4 space-y-4"
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
                // Real identities only - never a hardcoded stand-in name.
                const userName = resolveDisplayName(message.senderId);
                const textColor = isCurrentUser ? 'text-teal' : 'text-blue-400';
                const bgColor = isCurrentUser ? 'bg-teal' : 'bg-blue-400';

                return (
                  <div key={message.id} className="mb-4 mx-1 sm:mx-4 md:mx-10">
                    <div className="flex items-start space-x-2 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1 min-w-0">
                          <span className={`font-semibold uppercase truncate ${textColor}`}>
                            {userName}
                          </span>
                          <span className={`${bgColor} text-white text-xs px-2 py-[3px] rounded shrink-0`}>
                            {formatTime(message.timestamp)}
                          </span>
                        </div>
                        <div className={`${textColor} leading-tight text-sm break-words`}>
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

        {/* Bottom Input Area - sticks above the mobile keyboard */}
        <div className="sticky bottom-0 shrink-0 w-full md:w-[90%] mx-auto p-3 md:p-4 mb-0 md:mb-8 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-4 bg-beige/90 md:bg-transparent backdrop-blur-sm md:backdrop-blur-none border-t border-teal md:border-t-0 text-teal">
          <div className="relative">
            <IsolatedInput
              inputRef={inputRef}
              controlRef={inputControlRef}
              onSendMessage={handleSendMessage}
              placeholder="TYPE YOUR REPLY HERE"
              disabled={!isConnected || !isConnectionHealthy || isSendingMessage || !userProfile}
              className="w-full p-3 pr-12 border border-teal rounded-lg disabled:opacity-50 bg-beige placeholder:text-teal focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                // Route through the same submit path as the Enter key so the
                // input is cleared via React state and text can't be re-sent.
                inputControlRef.current?.submit();
              }}
              disabled={!isConnected || !isConnectionHealthy || isSendingMessage || !userProfile}
              aria-label="Send message"
              className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-teal hover:bg-teal text-white p-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
          {!isConnectionHealthy && (
            <p className="mt-2 text-xs uppercase text-teal">
              {effectiveConnectionStatus === 'offline'
                ? "You're offline — you can send again once you're back"
                : 'Waiting for the connection before you can send'}
            </p>
          )}
        </div>
      </div>

      {/* Custom End Conversation Dialog */}
      {showEndDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-conversation-title"
            className="bg-beige border-2 border-teal rounded-lg p-6 w-full max-w-md mx-4"
          >
            <div className="text-center">
              <h3 id="end-conversation-title" className="text-teal font-bold text-lg mb-4 uppercase">
                End Conversation?
              </h3>
              <p className="text-teal mb-6 text-sm uppercase">
                Are you sure you want to end the conversation? This action cannot be undone.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
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

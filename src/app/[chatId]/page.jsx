// @ts-nocheck
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation'; 
import { v4 as uuidv4 } from 'uuid';
import questions from '../../questions.json';
import { useRouter } from 'next/navigation';  
import { useWebSocket } from '../../websocket/WebSocketContext';
import { usePresenceSystem } from '../../websocket/presenceSystem';
import { useTypingIndicator } from '../../websocket/typingIndicator';
import { useReconnectionHandler } from '../../websocket/reconnectionHandler';
import { useDebounce } from '../../hooks/useDebounce';

/**
 * @typedef {Object} Message
 * @property {string} [id]
 * @property {string} [MessageId]
 * @property {string} sender
 * @property {string} [text]
 * @property {string} [Message]
 * @property {string} [timestamp]
 * @property {string} [Timestamp]
 * @property {string} [ReadTimestamp]
 */

export default function ChatRoom() {
  /** @type {[string | null, (error: string | null) => void]} */
  const [error, setError] = useState(null);
  /** @type {[Message[], (messages: Message[] | ((prev: Message[]) => Message[])) => void]} */
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  /** @type {React.MutableRefObject<Set<string>>} */
  const messageIdsRef = useRef(new Set());

  // Normalize message shape regardless of source
  const normalizeMessage = (message) => {
    return {
      id: message.id || message.MessageId || message.messageId,
      sender: message.sender || (message.senderId ? (message.senderId === userId ? 'user' : 'partner') : 'unknown'),
      text: message.text || message.Message || message.content,
      timestamp: message.timestamp || message.Timestamp || message.sentAt,
      readTimestamp: message.ReadTimestamp || message.readTimestamp
    };
  };

  // Sort messages by timestamp
  const sortMessagesByTimestamp = (messages) => {
    return [...messages].sort((a, b) => {
      const timeA = new Date(a.Timestamp || a.timestamp).getTime();
      const timeB = new Date(b.Timestamp || b.timestamp).getTime();
      return timeA - timeB;
    });
  };

  // /websocket states
  const { wsClient, wsActions, isConnected, conversationMetadata, userMetadata, initializeUserSession } = useWebSocket();
  const { updatePresence, otherUserPresence } = usePresenceSystem();
  const { sendTypingStatus, isTyping } = useTypingIndicator();

  // derived states from context
  const [isFindingMatch, setIsFindingMatch] = useState(!conversationMetadata.chatId);
  const [isEndingChat, setIsEndingChat] = useState(!!conversationMetadata.endedBy);
  const [questionIndex, setQuestionIndex] = useState(userMetadata.questionIndex);

  // Refs
  const hasNavigatedRef = useRef(false);
  /** @type {React.MutableRefObject<HTMLDivElement | null>} */
  const messageEndRef = useRef(null);
  /** @type {React.MutableRefObject<HTMLDivElement | null>} */
  const chatContainerRef = useRef(null);
  /** @type {React.MutableRefObject<string | undefined>} */
  const lastEvaluatedKeyRef = useRef(undefined);
  /** @type {React.MutableRefObject<NodeJS.Timeout | null>} */
  const typingTimeoutRef = useRef(null);

  const { chatId: encodedChatId } = useParams();
  const chatId = typeof encodedChatId === 'string' 
    ? decodeURIComponent(encodedChatId)
    : Array.isArray(encodedChatId) 
      ? decodeURIComponent(encodedChatId[0])
      : '';
  
  // Extract user ID from chatId (format: userA_userB)
  // For now, we'll assume we're userA - this should be replaced with actual auth
  const extractUserIdFromChatId = (chatId) => {
    if (!chatId) return null;
    
    // Split the chatId by underscore to get the two user IDs
    const parts = chatId.split('_');
    if (parts.length >= 2) {
      // For demonstration purposes, we'll use the first user ID
      // In a real app, this should come from authentication
      return parts[0];
    }
    return null;
  };
  
  const userId = extractUserIdFromChatId(chatId) || 'userA'; // Fallback to 'userA'
  
  // Safely compute otherUserId from chatId, but prefer conversation participants when available
  const getOtherUserIdFromChatId = (chatId, userId) => {
    if (!chatId) return '';
    const parts = chatId.split('_');
    return parts.find(id => id !== userId) || '';
  };

  // Helper function to safely get participants as array (handles both Array and Set formats)
  const getParticipantsAsArray = (participants) => {
    if (!participants) return [];
    if (Array.isArray(participants)) return participants;
    if (participants instanceof Set) return [...participants];
    return [];
  };
  
  // Use conversation participants if available, otherwise fall back to chatId parsing
  const participantsArray = getParticipantsAsArray(conversationMetadata.participants);
  const otherUserId = participantsArray.length === 2
    ? participantsArray.find(id => id !== userId) || ''
    : getOtherUserIdFromChatId(chatId, userId);
    
  // Debug logging
  console.log('ChatRoom debug:', { 
    chatId, 
    userId, 
    otherUserId, 
    participants: conversationMetadata.participants 
  });
    
  const router = useRouter();

  // Add reconnection handler
  useReconnectionHandler({
    maxRetries: 5,
    retryInterval: 1000,
    onReconnect: () => {
      // Re-sync conversation after reconnection
      wsActions.syncConversation({ chatId });
      // Update presence status
      updatePresence('online');
    },
    onMaxRetriesExceeded: () => {
      setError('Connection lost. Please refresh the page to reconnect.');
    }
  });

  // sync question index from user metadata
  useEffect(() => {
    console.log('📍 ChatRoom: questionIndex sync effect triggered:', { 
      userMetadataQuestionIndex: userMetadata.questionIndex, 
      currentLocalQuestionIndex: questionIndex,
      userId,
      userMetadata
    });
    if (userMetadata.questionIndex !== undefined) {
      setQuestionIndex(userMetadata.questionIndex);
    }
  }, [userMetadata.questionIndex]);

  // calculate the set number, current question text
  const currentSet = questions.sets.find(set =>
    set.questions.some(q => q.index === questionIndex)
  );
  
  const questionText = currentSet?.questions.find(q => q.index === questionIndex)?.text;
  
  console.log('📍 ChatRoom: Question calculation:', {
    questionIndex,
    currentSet: currentSet?.setNumber,
    questionText,
    userMetadataQuestionIndex: userMetadata.questionIndex
  });

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

  const loadMoreMessages = async () => {
    if (!hasMoreMessages || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      if (wsActions) {
        wsActions.fetchChatHistory({
          chatId,
          limit: 20,
          lastEvaluatedKey: lastEvaluatedKeyRef.current || undefined
        });
      }
    } catch (error) {
      setError('Failed to load more messages');
      console.error('Error loading more messages:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleScroll = useCallback(() => {
    if (!chatContainerRef.current) return;

    const { scrollTop } = chatContainerRef.current;
    if (scrollTop === 0) {
      loadMoreMessages();
    }
  }, []);

  // Add debounced scroll handler
  const debouncedScrollHandler = useDebounce(handleScroll, 200); // 200ms debounce

  /**
   * @param {React.FormEvent<HTMLFormElement>} e
   */
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !isConnected || !wsActions) return;

    const messageObject = {
      id: uuidv4(),
      sender: 'user',
      text: newMessage,
      timestamp: new Date().toISOString()
    };

    try {
      wsActions.sendMessage({
        chatId,
        messageId: messageObject.id,
        senderId: userId,
        content: newMessage,
        sentAt: messageObject.timestamp
      });

      setMessages(prev => sortMessagesByTimestamp([...prev, messageObject]));
      setNewMessage('');
      scrollToBottom();
    } catch (error) {
      setError('Failed to send message');
      console.error('Error sending message:', error);
    }
  };

  /**
   * @param {React.ChangeEvent<HTMLInputElement>} e
   */
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

  const handleReady = () => {
    if (!wsActions) return;
    
    wsActions.sendReadyToAdvance({
      chatId,
      userId,
      ready: true
    });
  };

  /**
   * @param {string} isoString
   */
  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const endConversation = async () => {
    try {
      setIsEndingChat(true);
      if (wsActions) {
        wsActions.endConversation({ chatId, userId });
      }
      navigateToCongrats();
    } catch (error) {
      setError('Failed to end chat');
      console.error('Error ending chat:', error);
    }
  };

  // Cleanup function
  const cleanup = () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  };

  // Initialize WebSocket connection and fetch chat history
  useEffect(() => {
    if (wsActions && initializeUserSession && chatId && isConnected) {
      console.log('📍 ChatRoom: Initializing WebSocket for chatId:', chatId, 'userId:', userId);
      console.log('📍 ChatRoom: Current userMetadata:', userMetadata);
      
      // Initialize user session - the context will handle caching and deduplication
      console.log('📍 ChatRoom: Calling initializeUserSession with userId:', userId);
      initializeUserSession(userId);
      
      // Only fetch chat history if we have a valid chatId and are connected
      if (chatId && chatId !== '') {
        console.log('📍 ChatRoom: Fetching chat history for chatId:', chatId);
        wsActions.fetchChatHistory({ chatId, limit: 20 });
        wsActions.syncConversation({ chatId });
      } else {
        console.log('📍 ChatRoom: Skipping fetchChatHistory - invalid chatId:', chatId);
      }
      
      updatePresence('online');
    } else {
      console.log('📍 ChatRoom: Skipping initialization - missing dependencies:', {
        wsActions: !!wsActions,
        initializeUserSession: !!initializeUserSession,
        chatId: !!chatId,
        isConnected
      });
    }
    return () => {
      cleanup();
      updatePresence('offline');
    };
  }, [wsActions, initializeUserSession, userId, chatId, isConnected, updatePresence]);

  // Update WebSocket message handlers
  useEffect(() => {
    if (wsClient) {
      wsClient.onMessage('message', (payload) => {
        if (payload.text || payload.Message) {
          const messageId = payload.id || payload.MessageId;
          if (messageId && !messageIdsRef.current.has(messageId)) {
            messageIdsRef.current.add(messageId);
            const normalizedMessage = normalizeMessage(payload);
            setMessages(prev => sortMessagesByTimestamp([...prev, normalizedMessage]));
            scrollToBottom();
          }
        }
      });

      wsClient.onMessage('chatHistory', (payload) => {
        console.log('Received chatHistory:', payload);
        
        // Handle both payload.messages and payload directly containing messages
        const messages = payload?.messages || payload || [];
        console.log('Processing chatHistory messages:', messages.length, 'messages');
        
        if (!Array.isArray(messages)) {
          console.warn('ChatHistory messages is not an array:', messages);
          return;
        }
        
        const newMessages = messages
          .filter(msg => {
            const messageId = msg.id || msg.MessageId || msg.messageId;
            if (messageId && !messageIdsRef.current.has(messageId)) {
              messageIdsRef.current.add(messageId);
              return true;
            }
            return false;
          })
          .map(normalizeMessage);
        
        console.log('Normalized chatHistory messages:', newMessages);
        setMessages(prev => sortMessagesByTimestamp([...newMessages, ...prev]));
        lastEvaluatedKeyRef.current = payload.lastEvaluatedKey;
        setHasMoreMessages(payload.hasMore ?? true);
      });

      wsClient.onMessage('advanceQuestion', (payload) => {
        setQuestionIndex(payload.questionIndex);
      });
    }
  }, [wsClient, wsActions, userId, chatId, otherUserId, navigateToCongrats]);

  // Handle conversation end and question completion
  useEffect(() => {
    if (hasNavigatedRef.current) return;

    // Only navigate if we have a chatId and either condition is met
    if (chatId && (conversationMetadata.endedBy || questionIndex === 36)) {
      hasNavigatedRef.current = true;
      cleanup();
      navigateToCongrats();
    }
  }, [conversationMetadata.endedBy, questionIndex, navigateToCongrats, chatId]);

  // Retry fetching chat history when conversation metadata becomes available
  useEffect(() => {
    if (wsActions && isConnected && conversationMetadata.chatId && messages.length === 0) {
      console.log('📍 ChatRoom: Retrying chat history fetch after conversation sync');
      wsActions.fetchChatHistory({ chatId: conversationMetadata.chatId, limit: 20 });
    }
  }, [wsActions, isConnected, conversationMetadata.chatId, messages.length]);

  // Handle early chat termination (before chatId is available)
  useEffect(() => {
    if (hasNavigatedRef.current) return;

    // If chat is already ended but we don't have chatId yet, wait for it
    if (conversationMetadata.endedBy && !chatId) {
      const timeoutId = setTimeout(() => {
        if (!hasNavigatedRef.current) {
          hasNavigatedRef.current = true;
          cleanup();
          navigateToCongrats();
        }
      }, 5000); // Wait up to 5 seconds for chatId

      return () => clearTimeout(timeoutId);
    }
  }, [conversationMetadata.endedBy, chatId, navigateToCongrats]);

  // Check if chat exists based on conversation metadata
  useEffect(() => {
    console.log('Conversation metadata changed:', conversationMetadata);
    if (conversationMetadata.chatId) {
      console.log('Found conversation, hiding loading screen');
      setIsFindingMatch(false);
    } else {
      console.log('No conversation metadata, showing loading screen');
      setIsFindingMatch(true);
    }
  }, [conversationMetadata]);

  useEffect(() => {
    const chatContainer = chatContainerRef.current;
    if (chatContainer) {
      chatContainer.addEventListener('scroll', debouncedScrollHandler);
      return () => {
        chatContainer.removeEventListener('scroll', debouncedScrollHandler);
      };
    }
  }, [debouncedScrollHandler]);

  if (isFindingMatch) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <div className="text-xl font-semibold mb-4">Finding a match...</div>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto p-4">
      <div className="mb-4 p-4 bg-yellow-100 border border-yellow-300 rounded-lg">
        <div className="text-sm text-gray-600">Set {currentSet?.setNumber}</div>
        <div className="text-lg font-semibold">{questionIndex} : {questionText || 'Loading question...'}</div>
      </div>

      {error && (
        <div className="mb-4 p-2 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Debug info - only show in development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mb-4 p-2 bg-gray-100 text-gray-600 rounded-lg text-xs">
          <div>Connected: {isConnected ? '✅' : '❌'}</div>
          <div>Messages: {messages.length}</div>
          <div>ChatId: {chatId}</div>
          <div>ConversationId: {conversationMetadata.chatId}</div>
          <div>UserId: {userId}</div>
        </div>
      )}

      <div 
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto mb-4 space-y-4"
        role="list"
      >
        {isLoadingMore && (
          <div className="text-center text-gray-500">Loading more messages...</div>
        )}
        
        {messages.map((message, index) => (
          <div
            key={message.id} 
            className={`flex ${
              message.sender === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-xs px-4 py-2 rounded-lg ${
                message.sender === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-800'
              }`}
            >
              <div>{message.text}</div>
              <div className="flex justify-end gap-1 text-xs mt-1">
                <span>{formatTime(message.timestamp)}</span>
                {message.readTimestamp && <span>✓✓</span>}
              </div>
            </div>
          </div>
        ))}
        <div ref={messageEndRef} />
      </div>

      {isTyping && otherUserId && isTyping[otherUserId] && (
        <div className="text-sm text-gray-500 mb-2">
          Partner is typing...
        </div>
      )}

      {otherUserPresence && (
        <div className="text-sm text-gray-500 mb-2">
          {otherUserPresence.status === 'online' ? (
            <span className="text-green-500">● Online</span>
          ) : otherUserPresence.status === 'away' ? (
            <span className="text-yellow-500">● Away</span>
          ) : (
            <span className="text-gray-500">
              Last seen {otherUserPresence.lastSeen ? new Date(otherUserPresence.lastSeen).toLocaleTimeString() : ''}
            </span>
          )}
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <button 
          onClick={handleReady}
          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
        >
          Ready For Next Question
        </button>
        
        <button
          onClick={endConversation}
          disabled={isEndingChat}
          className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
        >
          End Chat
        </button>
      </div>

      <form onSubmit={handleSendMessage} className="flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={handleTyping}
          onBlur={() => sendTypingStatus(false)}
          placeholder="Type a message..."
          className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={!isConnected}
          className={`px-4 py-2 rounded-lg transition-colors ${
            isConnected 
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Send
        </button>
      </form>
    </div>
  );
}

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

export default function ChatRoom() {
  // State for initialization phase
  const [isFindingMatch, setIsFindingMatch] = useState(true);
  const [error, setError] = useState(null);

  // State for real-time sync phase
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(1);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // State for chat lifecycle
  const [isEndingChat, setIsEndingChat] = useState(false);

  // Refs
  const hasNavigatedRef = useRef(false);
  const messageEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const lastEvaluatedKeyRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const { chatId: encodedChatId } = useParams();
  const chatId = typeof encodedChatId === 'string' 
    ? decodeURIComponent(encodedChatId)
    : Array.isArray(encodedChatId) 
      ? decodeURIComponent(encodedChatId[0])
      : '';
  
  const userId = 'DUMMY_USER_ID'; // TODO: Get from auth context
  const otherUserId = chatId.split('#').find(id => id !== userId) || '';
  const router = useRouter();
  const { wsClient, wsActions, isConnected, conversationMetadata, syncConversation } = useWebSocket();
  const { updatePresence, otherUserPresence } = usePresenceSystem();
  const { sendTypingStatus, isTyping } = useTypingIndicator();

  // Add reconnection handler
  useReconnectionHandler({
    maxRetries: 5,
    retryInterval: 1000,
    onReconnect: () => {
      // Re-sync conversation after reconnection
      syncConversation();
      // Update presence status
      updatePresence('online');
    },
    onMaxRetriesExceeded: () => {
      setError('Connection lost. Please refresh the page to reconnect.');
    }
  });

  // calculate the set number, current question text
  const currentSet = questions.sets.find(set =>
    set.questions.some(q => q.index === questionIndex)
  );
  
  const questionText = currentSet?.questions.find(q => q.index === questionIndex)?.text;

  const scrollToBottom = useCallback(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
          lastEvaluatedKey: lastEvaluatedKeyRef.current
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

      setMessages(prev => [...prev, messageObject]);
      setNewMessage('');
      scrollToBottom();
    } catch (error) {
      setError('Failed to send message');
      console.error('Error sending message:', error);
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

  const handleReady = () => {
    if (!wsActions) return;
    
    wsActions.sendReadyToAdvance({
      chatId,
      userId,
      readyToAdvance: true
    });
  };

  const formatTime = (isoString) => {
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
    if (wsActions) {
      wsActions.connect({ userId });
      wsActions.fetchChatHistory({ chatId, limit: 20 });
      syncConversation();
      updatePresence('online');
    }
    return () => {
      cleanup();
      updatePresence('offline');
    };
  }, []);

  // Update WebSocket message handlers
  useEffect(() => {
    if (wsClient) {
      wsClient.onMessage('message', (payload) => {
        if (payload.text || payload.Message) {
          setMessages(prev => [...prev, payload]);
          scrollToBottom();
        }
      });

      wsClient.onMessage('chatHistory', (payload) => {
        setMessages(prev => [...payload.messages, ...prev]);
        lastEvaluatedKeyRef.current = payload.lastEvaluatedKey;
        setHasMoreMessages(payload.hasMore);
        setIsHistoryLoaded(true);
      });

      wsClient.onMessage('advanceQuestion', (payload) => {
        setQuestionIndex(payload.questionIndex);
      });
    }
  }, [wsClient, wsActions, userId, chatId, otherUserId, navigateToCongrats]);

  useEffect(() => {
    if (questionIndex === 36) {
      navigateToCongrats();
    }
  }, [questionIndex, navigateToCongrats]);

  // Check if chat exists based on conversation metadata
  useEffect(() => {
    if (conversationMetadata.chatId) {
      setIsFindingMatch(false);
    } else {
      setIsFindingMatch(true);
    }
  }, [conversationMetadata]);

  // Handle conversation end
  useEffect(() => {
    if (conversationMetadata.endedBy) {
      cleanup();
      navigateToCongrats();
    }
  }, [conversationMetadata.endedBy, navigateToCongrats]);

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

      <div 
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto mb-4 space-y-4"
        onScroll={handleScroll}
      >
        {isLoadingMore && (
          <div className="text-center text-gray-500">Loading more messages...</div>
        )}
        
        {messages.map((message, index) => (
          <div
            key={message.id || index} 
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
              <div>{message.Message || message.text}</div>
              <div className="flex justify-end gap-1 text-xs mt-1">
                <span>{formatTime(message.Timestamp)}</span>
                {message.ReadTimestamp && <span>✓✓</span>}
              </div>
            </div>
          </div>
        ))}
        <div ref={messageEndRef} />
      </div>

      {isTyping[otherUserId] && (
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
              Last seen {new Date(otherUserPresence.lastSeen).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <button 
          onClick={handleReady}
          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
        >
          Ready Up
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

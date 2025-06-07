'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation'; 
import { v4 as uuidv4 } from 'uuid';
import questions from '../../questions.json';
import { useRouter } from 'next/navigation';  
import { useWebSocket } from '../../websocket/WebSocketContext';

export default function ChatRoom() {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(1);
  const hasNavigatedRef = useRef(false);
  const messageEndRef = useRef(null);
  const { chatId: encodedChatId } = useParams();
  const chatId = typeof encodedChatId === 'string' 
    ? decodeURIComponent(encodedChatId)
    : Array.isArray(encodedChatId) 
      ? decodeURIComponent(encodedChatId[0])
      : '';
  const userId = 'DUMMY_USER_ID';
  const otherUserId = chatId.split('#').find(id => id !== userId) || '';
  const router = useRouter();
  const { wsClient, wsActions, isConnected } = useWebSocket();

  // calculate the set number, current question text
  const currentSet = questions.sets.find(set =>
    set.questions.some(q => q.index === questionIndex)
  );
  
  const currentQuestion = currentSet?.questions.find(q => q.index === questionIndex);
  const setNumber = currentSet?.setNumber;
  const questionText = currentQuestion?.text;

  const scrollToBottom = () => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const navigateToCongrats = () => {
    if (!hasNavigatedRef.current) {
      hasNavigatedRef.current = true;
      router.push('/congrats');
    }
  };

  const fetchQuestionIndex = async () => {
    try { 
      const response = await fetch('/api/questions/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const data = await response.json();
      if (!response.ok) {
        console.error('Failed to fetch question index:', data.error);
      }
      else {
        console.log('Current question index:', data);
        setQuestionIndex(data.questionIndex);
      }
    } catch (error) {
      console.error('Error fetching question index:', error);
    }
  }

  useEffect(() => {
    if (isHistoryLoaded) {
      scrollToBottom();
    }
  }, [isHistoryLoaded]);

  useEffect(() => {
    fetchQuestionIndex();

    const loadHistory = async () => {
      try {
        const response = await fetch('/api/messages/load', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ chatId })
        });
        const data = await response.json();
        if (response.ok) {
          setMessages(data.messages);
          setIsHistoryLoaded(true);
    
          if (data.messages.length > 0) {
            const latestTimestamp = data.messages[0].Timestamp; // Newest first
            await markAllAsRead(chatId, latestTimestamp);
          }
        } else {
          console.error('Failed to load messages:', data.error);
        }
      } catch (error) {
        console.error('Error loading messages:', error);
      }
    };

    loadHistory();

    // Set up message handlers
    if (wsClient) {
      wsClient.onMessage('message', (payload) => {
        if (payload.text || payload.Message) {
          setMessages((prev) => [...prev, payload]);
        }
      });

      wsClient.onMessage('advanceQuestion', (payload) => {
        console.log('Advancing question:', payload.questionIndex);
        setQuestionIndex(payload.questionIndex);
      });

      wsClient.onMessage('PARTNER_DISCONNECTED', () => {
        console.log('Partner disconnected');
        navigateToCongrats();
      });

      wsClient.onMessage('conversationEnded', () => {
        console.log('Conversation ended');
        navigateToCongrats();
      });

      wsClient.onMessage('congrats', () => {
        navigateToCongrats();
      });

      // Send initial connection message
      if (wsActions) {
        wsActions.connect({ userId });
      }
    }
  }, [wsClient, wsActions]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    if (isConnected && wsActions) {
      const messageObject = {
        id: uuidv4(),
        sender: 'user',
        text: newMessage,
        timestamp: new Date().toISOString()
      };

      wsActions.sendMessage({
        chatId: chatId,
        messageId: messageObject.id,
        senderId: userId,
        content: newMessage,
        sentAt: messageObject.timestamp
      });

      setMessages((prev) => [...prev, messageObject]);
      setNewMessage('');
    } else {
      console.error('WebSocket is not connected or actions are not available');
    }
  };

  async function markAllAsRead(chatId, lastSeenTimestamp) {
    try {
      const response = await fetch('/api/messages/markRead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, beforeTimestamp: lastSeenTimestamp })
      });
      const data = await response.json();
      if (!response.ok) {
        console.error('Failed to mark messages as read:', data.error);
      }
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }
  
  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  async function handleReady() {
    if (!wsActions) {
      console.error('WebSocket actions are not available');
      return;
    }

    wsActions.sendReadyToAdvance({
      chatId,
      userId,
      readyToAdvance: true
    });
  }

  // if end of conversation, redirect to congrats page
  useEffect(() => {
    if (questionIndex === 36) {
      navigateToCongrats();
    }
  }, [questionIndex]);

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto p-4">
      <div className="mb-4 p-4 bg-yellow-100 border border-yellow-300 rounded-lg">
        <div className="text-sm text-gray-600">Set {setNumber}</div>
        <div className="text-lg font-semibold">{questionIndex} : {questionText || 'Loading question...'}</div>
      </div>

      <div className="flex-1 overflow-y-auto mb-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={message.id || index } 
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
              <div> {message.Message || message.text} </div>
              <div className="flex justify-end gap-1 text-xs mt-1">
                <span>{formatTime(message.Timestamp)}</span>
                {message.ReadTimestamp && <span>✓✓</span>}
              </div>
            </div>
          </div>
        ))}
        <div ref={messageEndRef} />
      </div>
      
      <button 
        onClick={handleReady}
        className="mb-4 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
      >
        Next Question
      </button>
      <form onSubmit={handleSendMessage} className="flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}

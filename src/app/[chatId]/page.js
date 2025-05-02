'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation'; 
import { v4 as uuidv4 } from 'uuid';

export default function ChatRoom() {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  const messageEndRef = useRef(null);
  let socket = useRef(null);
  const { chatId: encodedChatId } = useParams();
  const chatId = decodeURIComponent(encodedChatId);

  const scrollToBottom = () => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isHistoryLoaded) {
      scrollToBottom();
    }
  }, [isHistoryLoaded]);

  useEffect(() => {
    console.log('ChatID before fetch:', chatId);
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
            await loadHistory();
          }
        } else {
          console.error('Failed to load messages:', data.error);
        }
      } catch (error) {
        console.error('Error loading messages:', error);
      }
    };
    

    loadHistory();
    
    socket.current = new WebSocket(process.env.NEXT_PUBLIC_WEBSOCKET_API_ENDPOINT);

    socket.current.onopen = () => {
      setIsConnected(true);
      console.log('WebSocket connected');
    };

    socket.current.onclose = () => {
      setIsConnected(false);
      console.log('WebSocket disconnected');
    };

    socket.current.onmessage = (event) => {
      try {
        console.log('Received message:', event.data);
        const message = JSON.parse(event.data);
        setMessages((prev) => [...prev, message]);

        // If user is in chat and page is focused, mark messages as read
        if (document.hasFocus()) {
          console.log('Marking messages as read:', message.Timestamp, 'for chatId:', chatId );
          markAllAsRead(chatId, message.Timestamp);
        }
      } catch (error) {
        console.error('Error parsing message:', error, 'Message data:', event.data);
      }
    };

    socket.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      socket.current.close();
    };
  }, []);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    if (isConnected && socket.current) {
      const messageObject = { // local message object
        id: uuidv4(),
        sender: 'user',
        text: newMessage,
        timestamp: new Date().toISOString()
      };

      socket.current.send(JSON.stringify({
        action: 'sendMessage',
        data: {
          senderId: 'DUMMY_USER_ID',
          receiverId: 'DUMMY_RECEIVER_ID',
          message: newMessage,
          messageId: messageObject.id,
          timestamp: new Date().toISOString()
        }
      }));

      setMessages((prev) => [...prev, messageObject]);

      setNewMessage('');
    } else {
      console.error('WebSocket is not connected or socket is undefined');
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
  

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto p-4">
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

'use client';

import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';

export default function ChatRoom() {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const messageEndRef = useRef(null);
  let socket = useRef(null);

  const scrollToBottom = () => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
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
      const messageObject = {
        id: uuidv4(),
        sender: 'user',
        text: newMessage
      };

      socket.current.send(JSON.stringify({
        action: 'sendMessage',
        data: {
          senderId: 'DUMMY_USER_ID',
          message: newMessage,
          messageId: messageObject.id
        }
      }));

      setMessages((prev) => [...prev, messageObject]);

      setNewMessage('');
    } else {
      console.error('WebSocket is not connected or socket is undefined');
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto p-4">
      <div className="flex-1 overflow-y-auto mb-4 space-y-4">
        {messages.map((message) => (
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
              {message.text}
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

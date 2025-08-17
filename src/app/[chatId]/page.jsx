'use client';

import { use } from 'react';
import ChatRoom from '../components/ChatRoom.jsx';

export default function ChatPage({ params }) {
  const resolvedParams = use(params);
  return <ChatRoom chatId={resolvedParams.chatId} />;
}
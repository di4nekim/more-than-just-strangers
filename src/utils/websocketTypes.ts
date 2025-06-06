// Base WebSocket action types
export interface ConnectPayload {
  userId: string;
}

export interface StartConversationPayload {
  userAId: string;
  userBId: string;
}

export interface ReadyToAdvancePayload {
  userId: string;
  chatId: string;
  readyToAdvance: boolean;
}

export interface EndConversationPayload {
  userId: string;
  chatId: string;
  endReason?: string;
  endedBy?: string;
}

export interface SendMessagePayload {
  chatId: string;
  messageId: string;
  senderId: string;
  content: string;
  sentAt: string;
}

export interface FetchChatHistoryPayload {
  chatId: string;
  limit?: number;
  lastEvaluatedKey?: string;
}

export interface FetchUserMetadataPayload {
  userId: string;
}

export interface FetchConversationMetadataPayload {
  chatId: string;
}

export interface SyncConversationPayload {
  chatId: string;
}

export interface TypingStatusPayload {
  userId: string;
  chatId: string;
  isTyping: boolean;
}

export interface PresenceStatusPayload {
  userId: string;
  status: 'online' | 'offline' | 'away';
  lastSeen?: string;
}

// Metadata types
export interface UserMetadata {
  userId: string | null;
  connectionId: string | null;
  chatId: string | null;
  ready: boolean;
  questionIndex: number;
  lastSeen: string | null;
  createdAt: string | null;
}

export interface ConversationMetadata {
  chatId: string | null;
  participants: string[];
  lastMessage: {
    content: string;
    sentAt: string;
  } | null;
  lastUpdated: string | null;
  endedBy: string | null;
  endReason: string | null;
  createdAt: string | null;
}

// WebSocket action interface
export interface WebSocketActions {
  connect: (payload: ConnectPayload) => void;
  sendReadyToAdvance: (payload: ReadyToAdvancePayload) => void;
  endChat: (payload: EndConversationPayload) => void;
  sendMessage: (payload: SendMessagePayload) => void;
  startConversation: (payload: StartConversationPayload) => void;
  fetchChatHistory: (payload: FetchChatHistoryPayload) => void;
  fetchUserMetadata: (payload: FetchUserMetadataPayload) => void;
  fetchConversationMetadata: (payload: FetchConversationMetadataPayload) => void;
  syncConversation: (payload: SyncConversationPayload) => void;
  sendTypingStatus: (payload: TypingStatusPayload) => void;
  updatePresence: (payload: PresenceStatusPayload) => void;
} 
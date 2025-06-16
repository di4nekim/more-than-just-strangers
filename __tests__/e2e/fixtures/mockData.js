export const mockUser1 = {
  userId: 'user1',
  connectionId: 'conn-1',
  chatId: 'test-chat-id',
  ready: false,
  questionIndex: 0,
  lastSeen: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

export const mockUser2 = {
  userId: 'user2',
  connectionId: 'conn-2',
  chatId: 'test-chat-id',
  ready: false,
  questionIndex: 0,
  lastSeen: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

export const mockConversation = {
  chatId: 'test-chat-id',
  participants: ['user1', 'user2'],
  lastMessage: {
    content: 'Hello!',
    timestamp: new Date().toISOString(),
  },
  lastUpdated: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

export const mockMessages = [
  {
    chatId: 'test-chat-id',
    messageId: 'msg-1',
    senderId: 'user1',
    content: 'Hello!',
    sentAt: new Date().toISOString(),
    queued: false,
  },
  {
    chatId: 'test-chat-id',
    messageId: 'msg-2',
    senderId: 'user2',
    content: 'Hi there!',
    sentAt: new Date().toISOString(),
    queued: false,
  },
];

export const questions = [
  "Given the choice of anyone in the world, whom would you want as a dinner guest?",
  "Would you like to be famous? In what way?",
  "Before making a telephone call, do you ever rehearse what you are going to say? Why?",
  // ... add all 36 questions
];
/**
 * @typedef {Object} ConnectPayload
 * @property {string} userId
 */

/**
 * @typedef {Object} StartConversationPayload
 * @property {string} userAId
 * @property {string} userBId
 */

/**
 * @typedef {Object} ReadyToAdvancePayload
 * @property {string} userId
 * @property {string} chatId
 * @property {boolean} ready
 */

/**
 * @typedef {Object} EndConversationPayload
 * @property {string} userId
 * @property {string} chatId
 * @property {string} [endReason]
 * @property {string} [endedBy]
 */

/**
 * @typedef {Object} SendMessagePayload
 * @property {string} chatId
 * @property {string} messageId
 * @property {string} senderId
 * @property {string} content
 * @property {string} sentAt
 */

/**
 * @typedef {Object} FetchChatHistoryPayload
 * @property {string} chatId
 * @property {number} [limit]
 * @property {string} [lastEvaluatedKey]
 */

/**
 * @typedef {Object} FetchUserMetadataPayload
 * @property {string} userId
 */

/**
 * @typedef {Object} SyncConversationPayload
 * @property {string} chatId
 */

/**
 * @typedef {Object} TypingStatusPayload
 * @property {string} userId
 * @property {string} chatId
 * @property {boolean} isTyping
 */

/**
 * @typedef {Object} PresenceStatusPayload
 * @property {string} chatId
 * @property {string} userId
 * @property {'online'|'offline'|'away'} status
 * @property {string} [lastSeen]
 */

/**
 * @typedef {Object} UserMetadata
 * @property {string|null} userId
 * @property {string|null} connectionId
 * @property {string|null} chatId
 * @property {boolean} ready
 * @property {number} questionIndex
 * @property {string|null} lastSeen
 * @property {string|null} createdAt
 */

/**
 * @typedef {Object} ConversationMetadata
 * @property {string|null} chatId
 * @property {string[]} participants - Always converted to array on client side, even though it's a Set in DynamoDB
 * @property {{content: string, sentAt: string}|null} lastMessage
 * @property {string|null} lastUpdated
 * @property {string|null} endedBy
 * @property {string|null} endReason
 * @property {string|null} createdAt
 */

/**
 * @typedef {Object} WebSocketActions
 * @property {function(ConnectPayload): void} connect
 * @property {function(ReadyToAdvancePayload): void} sendReadyToAdvance
 * @property {function(EndConversationPayload): void} endConversation
 * @property {function(SendMessagePayload): void} sendMessage
 * @property {function(StartConversationPayload): void} startConversation
 * @property {function(FetchChatHistoryPayload): void} fetchChatHistory
 * @property {function(FetchUserMetadataPayload): void} fetchUserMetadata
 * @property {function(SyncConversationPayload): void} syncConversation
 * @property {function(TypingStatusPayload): void} sendTypingStatus
 * @property {function(PresenceStatusPayload): void} updatePresence
 * @property {function(): void} disconnect
 */

export {}; 
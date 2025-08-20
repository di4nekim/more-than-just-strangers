/**
 * Utility functions for handling chat IDs consistently across the application
 */

/**
 * Decodes a URL-encoded chat ID, handling various encoding scenarios
 * @param {string} chatId - The encoded chat ID
 * @returns {string} - The decoded chat ID
 */
export const decodeChatId = (chatId) => {
  if (!chatId) return '';
  
  try {
    // First try to decode the entire string
    const decoded = decodeURIComponent(chatId);
    return decoded;
  } catch (error) {
    console.warn(`Failed to decode chatId: ${chatId}`, error);
    return chatId;
  }
};

/**
 * Encodes a chat ID for URL usage
 * @param {string} chatId - The raw chat ID
 * @returns {string} - The encoded chat ID
 */
export const encodeChatId = (chatId) => {
  if (!chatId) return '';
  
  try {
    return encodeURIComponent(chatId);
  } catch (error) {
    console.warn(`Failed to encode chatId: ${chatId}`, error);
    return chatId;
  }
};

/**
 * Normalizes a chat ID by removing any trailing hash or encoded hash
 * @param {string} chatId - The chat ID to normalize
 * @returns {string} - The normalized chat ID
 */
export const normalizeChatId = (chatId) => {
  if (!chatId) return '';
  
  let normalized = chatId;
  
  // Remove trailing hash if present
  if (normalized.includes('#')) {
    normalized = normalized.split('#')[0];
  }
  
  // Remove trailing encoded hash if present
  if (normalized.includes('%23')) {
    normalized = normalized.split('%23')[0];
  }
  
  return normalized;
};

/**
 * Tries multiple chat ID formats to find a valid one
 * @param {string} chatId - The original chat ID
 * @returns {string[]} - Array of chat ID formats to try
 */
export const getChatIdFormats = (chatId) => {
  if (!chatId) return [];
  
  const formats = [];
  
  // Original format
  formats.push(chatId);
  
  // Decoded format
  try {
    const decoded = decodeURIComponent(chatId);
    if (decoded !== chatId) {
      formats.push(decoded);
    }
  } catch (error) {
    // Ignore decode errors
  }
  
  // Normalized format (without hash)
  const normalized = normalizeChatId(chatId);
  if (normalized !== chatId) {
    formats.push(normalized);
  }
  
  // Remove duplicates while preserving order
  return [...new Set(formats)];
};

/**
 * Checks if a chat ID is valid (not empty and has reasonable length)
 * @param {string} chatId - The chat ID to validate
 * @returns {boolean} - Whether the chat ID is valid
 */
export const isValidChatId = (chatId) => {
  if (!chatId || typeof chatId !== 'string') return false;
  if (chatId.trim().length === 0) return false;
  if (chatId.length > 100) return false; // Reasonable max length
  
  return true;
};

/**
 * Validates chat ID format according to backend expectations
 * @param {string} chatId - The chat ID to validate
 * @returns {Object} - Validation result with isValid boolean and error message
 */
export const validateChatIdFormat = (chatId) => {
  if (!chatId || typeof chatId !== 'string') {
    return { isValid: false, error: 'Chat ID must be a non-empty string' };
  }
  
  if (chatId.trim().length === 0) {
    return { isValid: false, error: 'Chat ID cannot be empty or whitespace' };
  }
  
  if (chatId.length > 100) {
    return { isValid: false, error: 'Chat ID is too long (max 100 characters)' };
  }
  
  // Try to decode the chat ID first in case it's URL encoded
  let decodedChatId = chatId;
  try {
    decodedChatId = decodeURIComponent(chatId);
  } catch (error) {
    // If decoding fails, use the original
    decodedChatId = chatId;
  }
  
  // Check if chat ID follows the expected format: userId1#userId2
  // Try splitting by both # and %23 (encoded hash)
  let parts = decodedChatId.split('#');
  
  // If no hash found, try splitting by encoded hash
  if (parts.length === 1) {
    parts = chatId.split('%23');
  }
  
  if (parts.length !== 2) {
    return { isValid: false, error: 'Chat ID should follow format: userId1#userId2' };
  }
  
  if (parts[0].trim().length === 0 || parts[1].trim().length === 0) {
    return { isValid: false, error: 'Chat ID parts cannot be empty' };
  }
  
  // Check if parts look like valid user IDs (basic validation)
  const userIdRegex = /^[a-zA-Z0-9_-]+$/;
  if (!userIdRegex.test(parts[0]) || !userIdRegex.test(parts[1])) {
    return { isValid: false, error: 'Chat ID contains invalid characters in user IDs' };
  }
  
  return { isValid: true };
};

/**
 * Validates user ID format
 * @param {string} userId - The user ID to validate
 * @returns {Object} - Validation result with isValid boolean and error message
 */
export const validateUserId = (userId) => {
  if (!userId || typeof userId !== 'string') {
    return { isValid: false, error: 'User ID must be a non-empty string' };
  }
  
  if (userId.trim().length === 0) {
    return { isValid: false, error: 'User ID cannot be empty or whitespace' };
  }
  
  if (userId.length > 50) {
    return { isValid: false, error: 'User ID is too long (max 50 characters)' };
  }
  
  // Check if user ID contains only valid characters
  const userIdRegex = /^[a-zA-Z0-9_-]+$/;
  if (!userIdRegex.test(userId)) {
    return { isValid: false, error: 'User ID contains invalid characters' };
  }
  
  return { isValid: true };
};

/**
 * Generates a consistent chat ID from two user IDs
 * @param {string} userId1 - First user ID
 * @param {string} userId2 - Second user ID
 * @returns {string} - Generated chat ID
 */
export const generateChatId = (userId1, userId2) => {
  // Validate both user IDs
  const validation1 = validateUserId(userId1);
  const validation2 = validateUserId(userId2);
  
  if (!validation1.isValid) {
    throw new Error(`Invalid first user ID: ${validation1.error}`);
  }
  
  if (!validation2.isValid) {
    throw new Error(`Invalid second user ID: ${validation2.error}`);
  }
  
  if (userId1 === userId2) {
    throw new Error('Cannot generate chat ID for same user');
  }
  
  // Ensure consistent chat ID generation by sorting user IDs
  const participants = [userId1, userId2].sort();
  return `${participants[0]}#${participants[1]}`;
};

/**
 * Logs chat ID information for debugging purposes
 * @param {string} chatId - The chat ID to log
 * @param {string} context - Context where this is being logged
 */
export const logChatIdInfo = (chatId, context = '') => {
  if (!chatId) {
    console.log(`${context}: No chat ID provided`);
    return;
  }
  
  const formats = getChatIdFormats(chatId);
  const normalized = normalizeChatId(chatId);
  const decoded = decodeChatId(chatId);
  const formatValidation = validateChatIdFormat(chatId);
  
  console.log(`${context}: Chat ID Debug Info:`, {
    original: chatId,
    decoded,
    normalized,
    allFormats: formats,
    length: chatId.length,
    hasHash: chatId.includes('#'),
    hasEncodedHash: chatId.includes('%23'),
    isValid: isValidChatId(chatId),
    formatValidation: formatValidation
  });
};

/**
 * Sanitizes a chat ID for safe usage
 * @param {string} chatId - The chat ID to sanitize
 * @returns {string} - The sanitized chat ID or empty string if invalid
 */
export const sanitizeChatId = (chatId) => {
  if (!chatId || typeof chatId !== 'string') return '';
  
  const trimmed = chatId.trim();
  if (trimmed.length === 0) return '';
  
  // Try to decode if it's URL encoded
  try {
    const decoded = decodeURIComponent(trimmed);
    return decoded;
  } catch (error) {
    return trimmed;
  }
};

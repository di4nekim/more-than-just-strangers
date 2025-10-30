export const decodeChatId = (chatId) => {
  if (!chatId) return '';
  
  try {
    const decoded = decodeURIComponent(chatId);
    return decoded;
  } catch (error) {
//     // console.warn(`Failed to decode chatId: ${chatId}`, error);
    return chatId;
  }
};


export const encodeChatId = (chatId) => {
  if (!chatId) return '';
  
  try {
    return encodeURIComponent(chatId);
  } catch (error) {
//     // console.warn(`Failed to encode chatId: ${chatId}`, error);
    return chatId;
  }
};

export const normalizeChatId = (chatId) => {
  if (!chatId) return '';
  
  let normalized = chatId;
  
  if (normalized.includes('#')) {
    normalized = normalized.split('#')[0];
  }
  
  if (normalized.includes('%23')) {
    normalized = normalized.split('%23')[0];
  }
  
  return normalized;
};


export const getChatIdFormats = (chatId) => {
  if (!chatId) return [];
  
  const formats = [];
  
  formats.push(chatId);
  
  try {
    const decoded = decodeURIComponent(chatId);
    if (decoded !== chatId) {
      formats.push(decoded);
    }
  } catch (error) {
    // Ignore decode errors
  }
  
  const normalized = normalizeChatId(chatId);
  if (normalized !== chatId) {
    formats.push(normalized);
  }
  
  const urlSafe = createUrlSafeChatId(chatId);
  if (urlSafe !== chatId && urlSafe !== decoded) {
    formats.push(urlSafe);
  }
  
  return [...new Set(formats)];
};


export const isValidChatId = (chatId) => {
  if (!chatId || typeof chatId !== 'string') return false;
  if (chatId.trim().length === 0) return false;
  if (chatId.length > 100) return false;
  
  return true;
};


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
  
  let decodedChatId = chatId;
  try {
    decodedChatId = decodeURIComponent(chatId);
  } catch (error) {
    decodedChatId = chatId;
  }
  
  let parts = null;
  
  if (decodedChatId.includes('#')) {
    parts = decodedChatId.split('#');
  } else if (chatId.includes('%23')) {
    parts = chatId.split('%23');
  } else if (chatId.includes('#')) {
    parts = chatId.split('#');
  }
  
  if (!parts || parts.length !== 2) {
    return { isValid: false, error: 'Chat ID should follow format: userId1#userId2' };
  }
  
  if (parts[0].trim().length === 0 || parts[1].trim().length === 0) {
    return { isValid: false, error: 'Chat ID parts cannot be empty' };
  }
  
  const userIdRegex = /^[a-zA-Z0-9_-]+$/;
  if (!userIdRegex.test(parts[0]) || !userIdRegex.test(parts[1])) {
    return { isValid: false, error: 'Chat ID contains invalid characters in user IDs' };
  }
  
  return { isValid: true };
};


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
  
  const userIdRegex = /^[a-zA-Z0-9_-]+$/;
  if (!userIdRegex.test(userId)) {
    return { isValid: false, error: 'User ID contains invalid characters' };
  }
  
  return { isValid: true };
};


export const generateChatId = (userId1, userId2) => {
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
  
  const participants = [userId1, userId2].sort();
  return `${participants[0]}#${participants[1]}`;
};


export const logChatIdInfo = (chatId, context = '') => {
  if (!chatId) {
//     // console.log(`${context}: No chat ID provided`);
    return;
  }
  
  const formats = getChatIdFormats(chatId);
  const normalized = normalizeChatId(chatId);
  const decoded = decodeChatId(chatId);
  const formatValidation = validateChatIdFormat(chatId);
  
  let validationDetails = {};
  if (formatValidation.isValid === false) {
    let decodedChatId = chatId;
    try {
      decodedChatId = decodeURIComponent(chatId);
    } catch (error) {
      decodedChatId = chatId;
    }
    
    if (decodedChatId.includes('#')) {
      validationDetails.parts = decodedChatId.split('#');
      validationDetails.separator = '#';
      validationDetails.source = 'decoded';
    } else if (chatId.includes('%23')) {
      validationDetails.parts = chatId.split('%23');
      validationDetails.separator = '%23';
      validationDetails.source = 'original';
    } else if (chatId.includes('#')) {
      validationDetails.parts = chatId.split('#');
      validationDetails.separator = '#';
      validationDetails.source = 'original';
    } else {
      validationDetails.parts = null;
      validationDetails.separator = 'none';
      validationDetails.source = 'none';
    }
  }
  
//   // console.log(`${context}: Chat ID Debug Info:`, {
    original: chatId,
    decoded,
    normalized,
    allFormats: formats,
    length: chatId.length,
    hasHash: chatId.includes('#'),
    hasEncodedHash: chatId.includes('%23'),
    isValid: isValidChatId(chatId),
    formatValidation: formatValidation,
    validationDetails: validationDetails
  });
};


export const sanitizeChatId = (chatId) => {
  if (!chatId || typeof chatId !== 'string') return '';
  
  const trimmed = chatId.trim();
  if (trimmed.length === 0) return '';
  
  try {
    const decoded = decodeURIComponent(trimmed);
    return decoded;
  } catch (error) {
    return trimmed;
  }
};


export const createUrlSafeChatId = (chatId) => {
  if (!chatId) return '';
  
  let decoded = chatId;
  try {
    decoded = decodeURIComponent(chatId);
  } catch (error) {
    decoded = chatId;
  }
  
  return decoded.replace(/#/g, '-');
};


export const fromUrlSafeChatId = (urlSafeChatId) => {
  if (!urlSafeChatId) return '';
  
  return urlSafeChatId.replace(/-/g, '#');
};

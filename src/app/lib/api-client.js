import { getAuth } from 'firebase/auth';

// Firebase auth can be async - need to ensure user is fully authenticated before API calls
const waitForAuth = async () => {
  let attempts = 0;
  const maxAttempts = 100;
  
  while (attempts < maxAttempts) {
    try {
      const auth = getAuth();
      if (auth?.currentUser) {
        try {
          const token = await auth.currentUser.getIdToken();
          if (token) return true;
        } catch {
          // Wait for auth to complete
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
  }
  
  throw new Error('Firebase authentication timeout - user not signed in');
};


const getAuthToken = async () => {
  const auth = getAuth();
  if (!auth.currentUser) throw new Error('No authenticated user');
  return auth.currentUser.getIdToken();
};

const buildQuery = (params) => {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value != null)
  ).toString();
  return query ? `?${query}` : '';
};

// Auto-retry with token refresh for transient auth/network failures
export async function authenticatedFetch(url, options = {}) {
  try {
    await waitForAuth();
  } catch (error) {
    throw new Error('Authentication required - please sign in to continue');
  }
  
  const maxRetries = 2;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const token = await getAuthToken();

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      };

      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        if (response.status === 401 && attempt < maxRetries) {
          await getAuth().currentUser.getIdToken(true);
          continue;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries && (
        error.message?.includes('token') || 
        error.message?.includes('401') ||
        error.message?.includes('Network')
      )) {
        try {
          await getAuth().currentUser.getIdToken(true);
          await new Promise(resolve => setTimeout(resolve, 1000 * (2 ** attempt)));
          continue;
        } catch {
          // Refresh failed, continue to next retry
        }
      }
      
      if (attempt === maxRetries) {
        throw lastError;
      }
    }
  }
}

export const apiClient = {
  async getInitialChatContext(userId) {
    return authenticatedFetch(`/api/user/${userId}/chat-context`);
  },

  async startNewChat() {
    return authenticatedFetch('/api/chat/start', { method: 'POST' });
  },

  async endChat(chatId, reason = 'user_ended') {
    return authenticatedFetch(`/api/chat/${chatId}/end`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  },

  async hasActiveChat() {
    return authenticatedFetch('/api/user/active-chat');
  },

  async getCurrentUserProfile() {
    return authenticatedFetch('/api/user/profile');
  },

  async getUserProfileById(userId) {
    return authenticatedFetch(`/api/user/${userId}/profile`);
  },

  async updateUserProfile(updates) {
    return authenticatedFetch('/api/user/profile', {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  },

  async getChatMessages(chatId, options = {}) {
    return authenticatedFetch(`/api/chat/${chatId}/messages${buildQuery(options)}`);
  },

  async sendChatMessage(chatId, content) {
    return authenticatedFetch(`/api/chat/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });
  },

  async validateChatAccess(chatId) {
    return authenticatedFetch(`/api/chat/${chatId}/validate`);
  },

  async getChatDetails(chatId) {
    return authenticatedFetch(`/api/chat/${chatId}`);
  },

  async updatePresenceStatus(status, lastSeen = null) {
    return authenticatedFetch('/api/user/presence', {
      method: 'PUT',
      body: JSON.stringify({ status, lastSeen })
    });
  },

  async getPartnerPresence(partnerId) {
    return authenticatedFetch(`/api/user/${partnerId}/presence`);
  },

  async reportChatIssue(chatId, issue) {
    return authenticatedFetch(`/api/chat/${chatId}/report`, {
      method: 'POST',
      body: JSON.stringify({ issue })
    });
  },

  async getUserChatHistory(options = {}) {
    return authenticatedFetch(`/api/user/chat-history${buildQuery(options)}`);
  }
};
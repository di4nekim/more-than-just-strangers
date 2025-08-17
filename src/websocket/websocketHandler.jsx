
import { getAuth } from 'firebase/auth';

export class WebSocketClient {

  constructor(wsUrl, onConnectionStateChange = null) {
    this.baseWsUrl = wsUrl;
    this.ws = null;
    this.isConnecting = false;
    this.connectionPromise = null;
    this.reconnectTimeout = null;
    this.messageHandlers = new Map();
    this.userId = null;
    this.errorCount = new Map();
    this.lastErrorTime = new Map();
    this.lastSentAction = null;
    this.sentActionHistory = [];
    this.authRetryCount = 0;
    this.maxAuthRetries = 3;
    this.onConnectionStateChange = onConnectionStateChange;
    this.isConnected = false;
    this.auth = getAuth();
    this.authUnsubscribe = this.auth.onAuthStateChanged((user) => {
      this.handleAuthStateChange(user);
    });
  }


  handleAuthStateChange(user) {
    if (!user) {

      this.disconnect();
    } else {

      this.authRetryCount = 0;
    }
  }


  async getAuthenticatedWebSocketUrl() {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        console.log('WebSocket: No authenticated user, using demo token');
        // Return a URL with demo token for development
        const baseUrl = process.env.NEXT_PUBLIC_WEBSOCKET_API_URL || 'wss://api.more-than-just-strangers.com';
        return `${baseUrl}?token=demo-token`;
      }

      // Force refresh token to ensure it's not expired
      const token = await user.getIdToken(true); // true forces refresh
      const baseUrl = process.env.NEXT_PUBLIC_WEBSOCKET_API_URL || 'wss://api.more-than-just-strangers.com';
      
      // Ensure baseUrl is a valid WebSocket URL
      if (!baseUrl || typeof baseUrl !== 'string') {
        throw new Error('Invalid WebSocket API URL configuration');
      }
      
      const authenticatedUrl = `${baseUrl}?token=${token}`;
      
      console.log('WebSocket: Generated authenticated URL with fresh token');
      return authenticatedUrl;
    } catch (error) {
      console.error('WebSocket: Error getting authenticated URL:', error);
      // Fallback to demo URL
      const baseUrl = process.env.NEXT_PUBLIC_WEBSOCKET_API_URL || 'wss://api.more-than-just-strangers.com';
      return `${baseUrl}?token=demo-token`;
    }
  }

  /**
   * Get current Firebase ID token
   */
  async getCurrentToken() {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        console.log('WebSocket: No authenticated user, returning demo token');
        return 'demo-token';
      }
      // Force refresh token to ensure it's not expired
      return await user.getIdToken(true); // true forces refresh
    } catch (error) {
      console.error('WebSocket: Error getting current token:', error);
      return 'demo-token';
    }
  }

  /**
   * Reconnect with fresh authentication token
   */
  async reconnectWithFreshToken() {
    console.log('WebSocket: Reconnecting with fresh token');
    this.disconnect();
    
    // Force refresh the Firebase token
    try {
      const user = this.auth.currentUser;
      if (user) {
        console.log('WebSocket: Forcing token refresh for reconnection');
        await user.getIdToken(true); // Force refresh
        console.log('WebSocket: Token refreshed successfully');
      }
    } catch (error) {
      console.error('WebSocket: Failed to refresh token:', error);
    }
    
    // Longer delay before reconnecting to ensure token refresh propagates
    setTimeout(() => {
      console.log('WebSocket: Attempting reconnection with fresh token');
      this.connect().catch(console.error);
    }, 2000); // Increased from 1 second to 2 seconds
  }

  /**
   * Handle authentication failure
   */
  handleAuthenticationFailure() {
    console.error('WebSocket: Authentication failure - disconnecting');
    this.disconnect();
    
    // Attempt reconnection with fresh token after a delay
    if (this.authRetryCount < this.maxAuthRetries) {
      this.authRetryCount++;
      console.log(`WebSocket: Will attempt reconnection ${this.authRetryCount}/${this.maxAuthRetries} in 3 seconds...`);
      
      setTimeout(() => {
        console.log('WebSocket: Attempting reconnection with fresh token');
        this.reconnectWithFreshToken().catch(error => {
          console.error('WebSocket: Reconnection failed:', error);
        });
      }, 3000); // Wait 3 seconds before retrying
    } else {
      console.error('WebSocket: Max auth retries exceeded');
      // Notify message handlers about auth failure
      const handler = this.messageHandlers.get('authError');
      if (handler) {
        handler({ error: 'Authentication failed', shouldSignIn: true });
      }
    }
  }
  
  /**
   * @param {string} [wsUrl] - Optional WebSocket URL with token (if not provided, will generate one)
   * @returns {Promise<void>}
   */
  async connect(wsUrl = null) {
    // If already connected, return existing promise
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    // If already connecting, return the existing connection promise
    if (this.isConnecting && this.connectionPromise) {
      return this.connectionPromise;
    }

    // If there's an existing connection promise that's still pending, return it
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.isConnecting = true;

    // Create a new connection promise
    this.connectionPromise = new Promise(async (resolve, reject) => {
      try {
        // Use provided URL or get authenticated WebSocket URL
        const authenticatedUrl = wsUrl || await this.getAuthenticatedWebSocketUrl();
        
        console.log('WebSocket: Creating WebSocket connection to:', authenticatedUrl);
        this.ws = new WebSocket(authenticatedUrl);

        // Set up connection timeout
        const connectionTimeout = setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            console.error('WebSocket: Connection timeout');
            this.ws.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000); // 10 second timeout

        this.ws.onopen = () => {
          clearTimeout(connectionTimeout);
          this.isConnecting = false;
          this.authRetryCount = 0; // Reset on successful connection
          this.isConnected = true;
          this.onConnectionStateChange?.(true);
          console.log('WebSocket: Connected with authentication');
          resolve();
        };
   
        this.ws.onclose = (event) => {
          clearTimeout(connectionTimeout);
          console.log('WebSocket: Connection closed with code:', event.code, 'reason:', event.reason);
          this.handleDisconnect(event);
          // Don't reject here, let handleDisconnect handle reconnection
        };

        this.ws.onerror = (error) => {
          clearTimeout(connectionTimeout);
          this.isConnecting = false;
          this.isConnected = false;
          this.onConnectionStateChange?.(false);
          console.error('WebSocket connection error:', error);
          // Don't reject immediately, let onclose handle it
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('WebSocket: Raw message received:', event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('WebSocket message parsing error:', error);
          }
        };
      } catch (error) {
        this.isConnecting = false;
        console.error('WebSocket: Error in connect method:', error);
        reject(error);
      }
    });

    // Clean up the connection promise when it resolves or rejects
    this.connectionPromise.finally(() => {
      this.connectionPromise = null;
    });

    return this.connectionPromise;
  }

  /**
   * Handle WebSocket connection establishment
   */
  handleConnect(event) {
    console.log('WebSocket: Connection established');
    this.isConnecting = false;
    this.isConnected = true;
    this.connectionPromise = null;
    
    if (this.onConnectionStateChange) {
      this.onConnectionStateChange(true);
    }
  }

  /**
   * Handle WebSocket disconnection
   */
  handleDisconnect(event) {
    console.log('WebSocket: Connection disconnected');
    console.log('WebSocket: Disconnect event:', event);
    console.log('WebSocket: Close code:', event.code);
    console.log('WebSocket: Close reason:', event.reason);
    
    this.isConnected = false;
    this.isConnecting = false;
    this.onConnectionStateChange?.(false);
    
    // Handle different close codes
    if (event.code === 1000) {
      // Normal closure
      console.log('WebSocket: Normal closure');
      return;
    } else if (event.code === 1001) {
      // Going away
      console.log('WebSocket: Going away');
      return;
    } else if (event.code === 1002) {
      // Protocol error
      console.log('WebSocket: Protocol error');
      return;
    } else if (event.code === 1003) {
      // Unsupported data
      console.log('WebSocket: Unsupported data');
      return;
    } else if (event.code === 1006) {
      // Abnormal closure
      console.log('WebSocket: Abnormal closure');
      return;
    } else if (event.code === 1008) {
      // Policy violation (often auth-related)
      console.log('WebSocket: Policy violation (often auth-related)');
      this.handleAuthenticationFailure();
      return;
    } else if (event.code === 1011) {
      // Server error
      console.log('WebSocket: Server error');
      return;
    } else if (event.code === 1015) {
      // TLS handshake failed
      console.log('WebSocket: TLS handshake failed');
      return;
    } else {
      console.log(`WebSocket: Unknown close code: ${event.code}`);
    }
    
    // If we're in demo mode, don't attempt reconnection
    if (this.isDemoMode) {
      console.log('WebSocket: Demo mode - not attempting reconnection');
      return;
    }
    
    // Handle auth-related disconnections
    if (event.code === 1008 || event.code === 1006) {
      if (this.authRetryCount < this.maxAuthRetries) {
        this.authRetryCount++;
        console.log(`WebSocket: Auth-related disconnection (retry ${this.authRetryCount}/${this.maxAuthRetries})`);
        
        // Try to refresh token and reconnect
        setTimeout(async () => {
          try {
            await this.reconnectWithFreshToken();
          } catch (error) {
            console.error('WebSocket: Failed to refresh token for reconnection', error);
            this.handleAuthenticationFailure();
          }
        }, 1000);
        return;
      }
    }
    
    // Handle normal reconnection
    if (this.shouldReconnect && !this.isReconnecting) {
      console.log('WebSocket: Attempting normal reconnection');
      this.handleReconnection();
    }
  }

  /**
   * @param {WebSocketMessage} message
   */
  async send(message) {
    console.log('WebSocket: Attempting to send message:', message);
    console.log('WebSocket: Connection state:', this.ws ? this.ws.readyState : 'No WebSocket');
    console.log('WebSocket: Is connected:', this.isConnected);
    
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket: Cannot send message - WebSocket is not connected');
      console.error('WebSocket: WebSocket exists:', !!this.ws);
      console.error('WebSocket: Ready state:', this.ws ? this.ws.readyState : 'No WebSocket');
      throw new Error('WebSocket is not connected');
    }
    
    console.log('WebSocket: Sending message:', message);
    
    // Add Firebase token to message for authentication with forced refresh
    try {
      // Force refresh token to ensure it's not expired
      const token = await this.getCurrentToken();
      const messageWithToken = {
        ...message,
        token: token, // Put token at root level, not in data
        data: {
          ...message.data
        }
      };
      
      // Track the action being sent
      this.lastSentAction = message.action;
      this.sentActionHistory.unshift({
        action: message.action,
        timestamp: new Date().toISOString(),
        data: message.data || message.payload
      });
      
      // Keep only last 10 actions
      if (this.sentActionHistory.length > 10) {
        this.sentActionHistory = this.sentActionHistory.slice(0, 10);
      }
      
      console.log('WebSocket: Sending message with fresh token at root level');
      this.ws.send(JSON.stringify(messageWithToken));
      console.log('WebSocket: Message sent successfully');
    } catch (error) {
      console.error('WebSocket: Failed to get token for message:', error);
      // Fallback to sending without token if token retrieval fails (reverted for compatibility)
      console.log('WebSocket: Sending message without token:', message);
      this.ws.send(JSON.stringify(message));
    }
  }


  onMessage(action, handler) {
    this.messageHandlers.set(action, handler);
  }

  /**
   * Check if an error is authentication-related
   */
  isAuthenticationError(error) {
    const errorStr = typeof error === 'string' ? error : JSON.stringify(error);
    const authErrorKeywords = [
      'unauthorized',
      'authentication',
      'invalid token',
      'token expired',
      'invalid or expired jwt token',
      'firebase_token_invalid',
      'firebase_token_missing',
      'forbidden',
      'access denied',
      'policy violation'
    ];
    
    return authErrorKeywords.some(keyword => 
      errorStr.toLowerCase().includes(keyword)
    );
  }

  /**
   * Check if an error is specifically a token expiration error
   */
  isTokenExpiredError(error) {
    const errorStr = typeof error === 'string' ? error : JSON.stringify(error);
    const tokenExpiredKeywords = [
      'invalid or expired jwt token',
      'token expired',
      'expired',
      'firebase_token_invalid',
      'firebase_token_expired',
      'firebase_token_revoked'
    ];
    
    return tokenExpiredKeywords.some(keyword => 
      errorStr.toLowerCase().includes(keyword)
    );
  }

  /**
   * @param {WebSocketMessage} message
   */
  handleMessage(message) {
    console.log('WebSocketHandler: Received message:', message);
    console.log('WebSocketHandler: Message type:', typeof message);
    console.log('WebSocketHandler: Message stringified:', JSON.stringify(message, null, 2));
    
    // Handle authentication-specific error messages only if they come from the server with proper structure
    if (message.error && typeof message.error === 'string' && this.isAuthenticationError(message.error)) {
      console.error('WebSocket: Authentication error received', message.error);
      
      // Check if this is specifically a token expiration error
      if (this.isTokenExpiredError(message.error)) {
        console.log('WebSocket: Token expired, attempting refresh and reconnect');
        this.reconnectWithFreshToken().catch(error => {
          console.error('WebSocket: Failed to reconnect with fresh token:', error);
          this.handleAuthenticationFailure();
        });
      } else {
        this.handleAuthenticationFailure();
      }
      return;
    }

    // Handle error messages that might not have a proper action field
    if (message.error || (message.data && message.data.error) || message.message === 'Internal server error') {
      this.handleError(message);
      return;
    }
    
    // Handle messages that might have missing action field but contain server errors
    if (!message.action) {
      // Check if this is a server error response without action field
      const messageStr = JSON.stringify(message).toLowerCase();
      if (messageStr.includes('internal server error') || (messageStr.includes('error') && message.error)) {
        this.handleError(message);
        return;
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.warn('WebSocketHandler: Message missing action field:', message);
      }
      return;
    }
    
    console.log('WebSocketHandler: Processing message with action:', message.action);
    console.log('WebSocketHandler: Available message handlers:', Array.from(this.messageHandlers.keys()));
    
    const handler = this.messageHandlers.get(message.action);
    if (handler) {
      // Check both payload and data fields for compatibility with different message formats
      const payload = message.payload || message.data;
      console.log('WebSocketHandler: Calling handler for action:', message.action, 'with payload:', payload);
      try {
        handler(payload);
        console.log('WebSocketHandler: Handler executed successfully for action:', message.action);
      } catch (error) {
        console.error('WebSocketHandler: Error in handler for action:', message.action, error);
      }
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.warn('WebSocketHandler: No handler found for action:', message.action);
        console.warn('WebSocketHandler: Available handlers:', Array.from(this.messageHandlers.keys()));
      }
    }
  }

  /**
   * Handle errors with throttling to prevent console spam
   * @param {WebSocketMessage} message
   */
  handleError(message) {
    const errorMessage = message.error || 
                        (message.data && message.data.error) || 
                        message.message || 
                        'Unknown error';
    
    // Create a more specific error key for server errors
    let errorKey = typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage);
    
    // For server errors without action, use connection info to create unique key
    if (errorMessage === 'Internal server error' && message.connectionId && message.requestId) {
      errorKey = `Internal server error (connection-based)`;
    }
    
    // Throttle identical errors - only log once per 10 seconds for server errors
    const now = Date.now();
    const throttleTime = (errorMessage && errorMessage.toString().toLowerCase().includes('internal server error')) ? 10000 : 5000;
    const lastTime = this.lastErrorTime.get(errorKey) || 0;
    const count = this.errorCount.get(errorKey) || 0;
    
    this.errorCount.set(errorKey, count + 1);
    
    if (now - lastTime > throttleTime) {
      this.lastErrorTime.set(errorKey, now);
      const totalCount = this.errorCount.get(errorKey);
      
      console.error('WebSocket Error (throttled):', {
        error: errorMessage,
        count: totalCount,
        likelyFailingAction: this.lastSentAction,
        recentActions: this.sentActionHistory.slice(0, 3),
        connectionId: message.connectionId,
        requestId: message.requestId,
        timestamp: new Date().toISOString()
      });
      
      // Additional context for internal server errors
      if (errorMessage && errorMessage.toString().toLowerCase().includes('internal server error')) {
        console.error('Server Error Analysis:', {
          mostLikelyFailingAction: this.lastSentAction,
          wsUrl: this.baseWsUrl,
          userId: this.userId,
          errorCount: totalCount,
          actionsSinceLastError: this.sentActionHistory.slice(0, 5),
          suggestion: this.getSuggestion(this.lastSentAction),
          troubleshootingTips: [
            'Check if chatId is valid format: userA_userB',
            'Verify user exists in database',
            'Check AWS Lambda function logs',
            'Ensure WebSocket API Gateway is running',
            'Verify authentication token is valid'
          ]
        });
      }
    }

    // Emit error event for frontend to handle
    // This allows the frontend to remove optimistic messages when server errors occur
    if (this.messageHandlers.has('error')) {
      try {
        const errorData = {
          error: errorMessage,
          action: this.lastSentAction,
          recentActions: this.sentActionHistory.slice(0, 3),
          connectionId: message.connectionId,
          requestId: message.requestId,
          timestamp: new Date().toISOString()
        };
        this.messageHandlers.get('error')(errorData);
      } catch (handlerError) {
        console.error('Error in error handler:', handlerError);
      }
    }
  }

  getSuggestion(action) {
    const suggestions = {
      'sendMessage': 'Verify chatId format and user permissions',
      'setReady': 'Check if user is in an active conversation',
      'getCurrentState': 'Ensure userId exists in database',
      'startConversation': 'Verify user is not already in a conversation',
      'endConversation': 'Check if conversation exists and user has permission',
      'fetchChatHistory': 'Verify chatId and user access permissions'
    };
    
    return suggestions[action] || 'Check server logs for more details';
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.authRetryCount = 0;
    this.isConnected = false;
    this.onConnectionStateChange?.(false);
  }

  /**
   * @param {string} userId
   */
  setUserId(userId) {
    this.userId = userId;
  }

  /**
   * @returns {string}
   */
  getUserId() {
    if (!this.userId) {
      throw new Error('User ID not set');
    }
    return this.userId;
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.disconnect();
    if (this.authUnsubscribe) {
      this.authUnsubscribe();
    }
  }
}
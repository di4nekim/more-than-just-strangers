/**
 * @typedef {Object} WebSocketMessage
 * @property {string} action
 * @property {any} [payload]
 * @property {any} [data]
 */

export class WebSocketClient {
  /**
   * @param {string} wsUrl
   */
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.isConnecting = false;
    this.reconnectTimeout = null;
    this.messageHandlers = new Map();
    this.userId = null;
  }

  /**
   * @returns {Promise<void>}
   */
  connect() {
    if (this.isConnecting) {
      return Promise.reject(new Error('Connection already in progress'));
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          this.isConnecting = false;
          resolve();
        };

        this.ws.onclose = () => {
          this.handleDisconnect();
        };

        this.ws.onerror = (error) => {
          this.isConnecting = false;
          reject(error);
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  handleDisconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch(console.error);
    }, 1000);
  }

  /**
   * @param {WebSocketMessage} message
   */
  send(message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    this.ws.send(JSON.stringify(message));
  }

  /**
   * @param {string} action
   * @param {function(any): void} handler
   */
  onMessage(action, handler) {
    this.messageHandlers.set(action, handler);
  }

  /**
   * @param {WebSocketMessage} message
   */
  handleMessage(message) {
    const handler = this.messageHandlers.get(message.action);
    if (handler) {
      handler(message.payload);
    }
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
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
}
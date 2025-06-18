import { Server } from 'mock-socket';

export class MockWebSocketServer {
  constructor(url) {
    this.server = new Server(url);
    this.clients = new Set();
    
    this.server.on('connection', (socket) => {
      this.clients.add(socket);
      
      socket.on('message', (data) => {
        this.handleMessage(socket, data);
      });
      
      socket.on('close', () => {
        this.clients.delete(socket);
      });
    });
  }
  
  handleMessage(socket, data) {
    const message = JSON.parse(data);
    
    switch (message.type) {
      case 'sendMessage':
        this.broadcast({
          type: 'newMessage',
          data: {
            ...message.data,
            messageId: `msg-${Date.now()}`,
            sentAt: new Date().toISOString(),
          },
        });
        break;
        
      case 'readyUp':
        this.broadcast({
          type: 'userReadyUpdate',
          data: message.data,
        });
        break;
        
      case 'advanceQuestion':
        this.broadcast({
          type: 'questionIndexUpdate',
          data: {
            questionIndex: message.data.currentIndex + 1,
          },
        });
        break;
        
      default:
        console.warn('Unknown message type:', message.type);
    }
  }
  
  broadcast(message) {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      client.send(data);
    });
  }
  
  simulatePartnerDisconnect() {
    this.broadcast({
      type: 'partnerDisconnected',
      data: {},
    });
  }
  
  close() {
    this.server.close();
  }
}
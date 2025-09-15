# More Than Just Strangers

**Enterprise-grade real-time chat platform with serverless microservices, WebSocket architecture, and comprehensive test automation**

*A scalable chat application implementing the "36 Questions for Falling in Love" through modern cloud-native architecture*

[![Test Coverage](https://img.shields.io/badge/Coverage-70%25+-brightgreen.svg)](#) ![Deployment Status](https://img.shields.io/badge/AWS-deploying-orange?style=flat&logo=amazon-aws) ![Architecture](https://img.shields.io/badge/Architecture-Serverless-blue?style=flat&logo=aws-lambda)

---

## Technical Highlights

• **Real-time WebSocket system** handling concurrent connections with **sub-100ms latency**  
• **9 specialized Lambda functions** in complete serverless microservices architecture  
• **Advanced DynamoDB design** with GSIs, single-table patterns, and optimistic concurrency  
• **70%+ test coverage** across unit, integration, E2E, and WebSocket test suites  
• **Infrastructure as Code** with complete AWS SAM deployment pipeline  
• **Modern React patterns** with hooks, context API, and optimistic UI updates  

---

## Technology Stack

### **Backend & Infrastructure**
![AWS Lambda](https://img.shields.io/badge/AWS%20Lambda-FF9900?style=flat&logo=aws-lambda&logoColor=white) ![DynamoDB](https://img.shields.io/badge/DynamoDB-4053D6?style=flat&logo=amazon-dynamodb&logoColor=white) ![API Gateway](https://img.shields.io/badge/API%20Gateway-FF4F8B?style=flat&logo=amazon-api-gateway&logoColor=white) ![CloudFormation](https://img.shields.io/badge/CloudFormation-FF9900?style=flat&logo=amazon-aws&logoColor=white)

- **Serverless**: AWS Lambda (Node.js 20.x), API Gateway WebSocket
- **Database**: DynamoDB with GSI optimization and TTL management  
- **Infrastructure**: AWS SAM, CloudFormation IaC
- **Authentication**: Firebase Auth with JWT middleware

### **Frontend & Real-time**
![React](https://img.shields.io/badge/React%2019-61DAFB?style=flat&logo=react&logoColor=black) ![Next.js](https://img.shields.io/badge/Next.js%2015-000000?style=flat&logo=next.js&logoColor=white) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-38B2AC?style=flat&logo=tailwind-css&logoColor=white) ![WebSocket](https://img.shields.io/badge/WebSocket-010101?style=flat&logo=socketdotio&logoColor=white)

- **Frontend**: React 19, Next.js 15, JavaScript ES6+
- **Styling**: TailwindCSS with responsive design patterns
- **Real-time**: WebSocket API with automatic reconnection
- **State**: React Context API, custom hooks

### **Testing & DevOps**
![Jest](https://img.shields.io/badge/Jest-C21325?style=flat&logo=jest&logoColor=white) ![Testing Library](https://img.shields.io/badge/Testing%20Library-E33332?style=flat&logo=testing-library&logoColor=white) ![ESLint](https://img.shields.io/badge/ESLint-4B32C3?style=flat&logo=eslint&logoColor=white)

- **Testing**: Jest, React Testing Library, WebSocket testing
- **Quality**: ESLint, 70%+ coverage enforcement
- **CI/CD**: Multi-environment deployment pipeline

---

## Key Technical Metrics

| Metric | Achievement |
|--------|-------------|
| **Lambda Functions** | 9 specialized microservices |
| **Database Tables** | 4 optimized DynamoDB tables with GSIs |
| **Test Coverage** | 70%+ across all test categories |
| **Response Latency** | Sub-100ms real-time message delivery |
| **Architecture** | 100% serverless, auto-scaling |
| **Environments** | Dev/Staging/Prod with IaC deployment |

---

## System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   React Client  │────│  API Gateway     │────│  Lambda Layer   │
│   • WebSocket   │    │  • WebSocket API │    │  • 9 Functions  │
│   • State Mgmt  │    │  • REST API      │    │  • Error Handle │
│   • Auth        │    │  • CORS/Auth     │    │  • Concurrency  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         │              ┌──────────────────┐              │
         │              │  DynamoDB Layer  │              │
         │              │  • UserMetadata  │              │
         └──────────────│  • Messages      │──────────────┘
                        │  • Conversations │
                        │  • MatchQueue    │
                        └──────────────────┘
```

**Key Architectural Decisions:**
- **Serverless-first**: Zero server management, automatic scaling
- **Event-driven**: WebSocket connections trigger Lambda functions
- **Single-table design**: Optimized DynamoDB queries with composite keys
- **Stateless functions**: Horizontal scaling with shared DynamoDB state

---

## Core Technical Features

### **Real-time Communication System**
- WebSocket-based architecture with connection lifecycle management
- Message delivery guarantees with retry logic
- Presence detection and typing indicators
- Automatic reconnection handling for network resilience

### **Advanced Matchmaking Engine**
- Queue-based user pairing with TTL cleanup
- Real-time status updates via WebSocket broadcasts
- Concurrent user handling with optimistic locking
- State synchronization across disconnections

### **Database Engineering**
- Single-table DynamoDB design for optimal performance
- Global Secondary Indexes for complex query patterns
- TTL implementation for automatic data cleanup
- Optimistic concurrency control for race condition prevention

### **Comprehensive Testing Strategy**
```bash
├── Unit Tests (React components, utilities)
├── Integration Tests (API workflows, Lambda functions)  
├── WebSocket Tests (real-time communication flows)
├── Authentication Tests (security scenarios)
├── E2E Tests (complete user journeys)
└── Performance Tests (load testing, latency validation)
```

---

## Security & Performance

### **Security Implementation**
- Firebase Authentication with JWT validation
- CSRF protection for state-changing operations  
- IAM roles with least-privilege access
- Connection validation for WebSocket security
- Environment variable management for secrets

### **Performance Optimization**
- DynamoDB on-demand billing for cost-effective scaling
- Lambda function optimization (sub-100ms cold starts)
- WebSocket connection pooling and cleanup
- Optimistic UI updates for perceived performance
- CDN integration for static asset delivery

---

## Business Context

**Problem Solved**: Created a platform for meaningful connections between strangers using scientifically-backed conversation starters (Arthur Aron's "36 Questions for Falling in Love").

**Key Features**:
- Real-time matchmaking with instant user pairing
- Progressive question system guiding conversations
- Live chat with presence detection and message history
- Mobile-responsive design with offline support
- Session persistence across reconnections

---

## Development & Deployment

### **Infrastructure as Code**
```bash
# Complete infrastructure deployment
cd server/lambdas
sam build && sam deploy

# Multi-environment management
sam deploy --parameter-overrides Environment=staging
sam deploy --parameter-overrides Environment=production
```

### **Local Development**
```bash
# Quick start
npm install && npm run setup:env
npm run dev

# Testing
npm run test:coverage        # Full test suite
npm run test:integration     # API integration tests
npm run test:websocket      # Real-time communication tests
```

### **Environment Management**
- **Development**: Local DynamoDB + Firebase emulators
- **Staging**: AWS resources with development configurations  
- **Production**: Hardened AWS infrastructure with monitoring

---

## Technical Achievements Summary

This project demonstrates proficiency in:

**Full-stack development** with modern React and serverless backend  
**Real-time systems** design and WebSocket implementation  
**Cloud architecture** with AWS serverless services  
**Database design** with NoSQL optimization patterns  
**Test-driven development** with comprehensive coverage  
**DevOps practices** with Infrastructure as Code  
**Performance engineering** with sub-100ms latency targets  
**Security implementation** with authentication and authorization  

*Built to showcase enterprise-grade development practices and modern cloud-native architecture patterns.*

# More Than Just Strangers

**A scalable real-time chat application implementing the "36 Questions for Falling in Love" experiment through modern cloud-native architecture.**

[![Live Demo](https://img.shields.io/badge/Demo-Live-green.svg)](#) [![Test Coverage](https://img.shields.io/badge/Coverage-70%25+-brightgreen.svg)](#) [![AWS](https://img.shields.io/badge/AWS-Deployed-orange.svg)](#)

## Project Overview

A real-time chat platform that connects strangers through structured conversation using Arthur Aron's scientifically-backed "36 Questions for Falling in Love." Built with enterprise-grade architecture featuring real-time WebSocket communication, serverless compute, and comprehensive test coverage.

**Key Achievement**: Designed and implemented a complete full-stack application demonstrating proficiency in modern web development, cloud infrastructure, real-time systems, and DevOps practices.

## Core Features

- **Real-time Matchmaking**: Advanced queue-based system for instant user pairing
- **Live Chat Interface**: WebSocket-powered messaging with presence detection
- **Progressive Question System**: Guided conversation through 36 scientifically-curated questions
- **Authentication & Security**: Firebase Auth integration with JWT validation and CSRF protection
- **Responsive Design**: Mobile-first UI with TailwindCSS and modern React patterns
- **Session Management**: Persistent chat states with automatic reconnection handling

## Technical Architecture

### Frontend Architecture

```
React 19 + Next.js 15 Framework
├── Custom Hooks & Context API for state management
├── WebSocket client with automatic reconnection
├── Optimistic UI updates for smooth UX
├── Responsive design with TailwindCSS
└── Component-based architecture with test coverage
```

### Backend Infrastructure

```
AWS Serverless Architecture
├── API Gateway WebSocket API (real-time communication)
├── Lambda Functions (9 microservices)
│   ├── Connection management (onConnect/onDisconnect)
│   ├── Message handling (sendMessage/fetchHistory)
│   ├── Matchmaking system (startConversation/setReady)
│   ├── State management (getCurrentState/syncConversation)
│   └── Presence tracking (updatePresence)
├── DynamoDB Tables (4 optimized data models)
│   ├── UserMetadata (GSI for connection mapping)
│   ├── Messages (composite keys for efficient queries)
│   ├── Conversations (conversation lifecycle management)
│   └── MatchmakingQueue (TTL-enabled with status indexing)
└── CloudFormation IaC with environment parameterization
```

### Database Design

- **Single-table design patterns** for optimal DynamoDB performance
- **Global Secondary Indexes** for efficient queries
- **TTL implementation** for automatic queue cleanup
- **Optimistic concurrency control** for data consistency

## Technology Stack

### Core Technologies

- **Frontend**: React 19, Next.js 15, JavaScript ES6+
- **Styling**: TailwindCSS, responsive design patterns
- **State Management**: React Context API, custom hooks
- **Real-time**: WebSocket API, AWS API Gateway

### Cloud & Infrastructure

- **Compute**: AWS Lambda (Node.js 20.x runtime)
- **Database**: Amazon DynamoDB with optimized data modeling
- **API**: AWS API Gateway (WebSocket + REST)
- **Auth**: Firebase Authentication with admin SDK
- **IaC**: AWS SAM (Serverless Application Model)
- **CI/CD**: CloudFormation with environment management

### Development & Testing

- **Testing**: Jest + React Testing Library (70%+ coverage)
- **Test Types**: Unit, Integration, E2E, API, WebSocket
- **Code Quality**: ESLint, comprehensive test suites
- **Development**: Hot reloading, environment-specific configs

## Project Metrics

- **9 Lambda Functions** with optimized performance and error handling
- **4 DynamoDB Tables** with efficient data access patterns
- **70%+ Test Coverage** across unit, integration, and E2E tests
- **Sub-100ms Latency** for real-time message delivery
- **Scalable Architecture** supporting concurrent users through serverless design
- **Environment Management** with dev/staging/prod deployment pipelines

## Testing Strategy

### Comprehensive Test Suite

```bash
# Test Categories
├── Unit Tests (React components, utilities)
├── Integration Tests (API workflows, data flow)
├── WebSocket Tests (real-time communication)
├── Authentication Tests (security, error scenarios)
├── E2E Tests (complete user journeys)
└── Lambda Tests (serverless function validation)

# Test Commands
npm run test:coverage        # Full coverage report
npm run test:integration     # Integration test suite
npm run test:auth           # Authentication flows
npm run test:websocket      # Real-time communication
```

### Quality Metrics

- **70% minimum coverage** threshold enforced
- **Automated test categorization** with dedicated test runner
- **Mock implementations** for external services (Firebase, WebSocket)
- **Error scenario testing** for robust error handling

## Development Setup

### Prerequisites

- Node.js 18+ and npm
- AWS CLI configured
- Firebase project setup

### Quick Start

```bash
# Clone and install
git clone <repository>
cd more-than-just-strangers
npm install

# Environment setup
npm run setup:env

# Development server
npm run dev

# Run test suite
npm run test:coverage

# Deploy infrastructure
cd server/lambdas
sam build && sam deploy
```

### Environment Configuration

- **Development**: Local DynamoDB + Firebase emulators
- **Staging**: AWS resources with development settings
- **Production**: Optimized AWS infrastructure with security hardening

## User Experience Features

- **Intuitive Onboarding**: Seamless Firebase authentication flow
- **Smart Matchmaking**: Queue-based system with real-time status updates
- **Guided Conversations**: Progressive question revelation system
- **Live Interactions**: Typing indicators, presence detection, message status
- **Graceful Degradation**: Offline support with message queuing
- **Responsive Design**: Mobile-optimized interface with touch-friendly controls

## Security Implementation

- **Firebase Authentication** with secure token validation
- **JWT middleware** for API endpoint protection
- **CSRF protection** for state-changing operations
- **Connection validation** for WebSocket security
- **Environment variable management** for secrets
- **IAM roles** with least-privilege access patterns

## Scalability Considerations

- **Serverless architecture** for automatic scaling
- **DynamoDB on-demand billing** for cost-effective scaling
- **WebSocket connection management** with automatic cleanup
- **Stateless Lambda functions** for horizontal scaling
- **CloudFormation stack** for infrastructure as code
- **Multi-environment deployment** pipeline

## Key Technical Achievements

1. **Real-time System Design**: Implemented WebSocket-based architecture handling concurrent connections with message delivery guarantees

2. **Serverless Microservices**: Designed 9 specialized Lambda functions with optimized performance and error handling

3. **Database Optimization**: Created efficient DynamoDB data models with GSIs for complex query patterns

4. **Test-Driven Development**: Achieved 70%+ test coverage with comprehensive test categorization and automation

5. **Infrastructure as Code**: Built complete AWS infrastructure using SAM with environment parameterization

6. **Modern Frontend Patterns**: Implemented React hooks, context patterns, and optimistic UI updates for smooth UX

---

** Contact**: Ready to discuss technical implementation details, architecture decisions, or potential improvements to this system.

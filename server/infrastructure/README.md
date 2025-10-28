# Infrastructure Consolidation

## Overview

This document describes the consolidation of the matchmaking queue table from a separate CloudFormation template into the main `template.yaml` file.

## Changes Made

### 1. Consolidated CloudFormation Template

- **Before**: `matchmaking-queue-table.yaml` was a separate standalone template
- **After**: All infrastructure is now defined in `server/lambdas/template.yaml`

### 2. Added Environment Parameter

- Added `Environment` parameter to support multiple environments (Dev, Staging, Prod)
- All table names now use the pattern: `TableName-${Environment}`
- Example: `MatchmakingQueue-Dev`, `UserMetadataV2-Dev`, etc.

### 3. Updated Table Names

- **UserMetadataTable**: `UserMetadataV2` → `UserMetadataV2-${Environment}`
- **MessagesTable**: `MessagesV2` → `MessagesV2-${Environment}`
- **ConversationsTable**: `ConversationsV3` → `ConversationsV3-${Environment}`
- **MatchmakingQueueTable**: `MatchmakingQueue-Dev` → `MatchmakingQueue-${Environment}`

### 4. Environment Variables

All Lambda functions now receive the `MATCHMAKING_QUEUE_TABLE` environment variable:

- `OnConnectFunction`
- `OnDisconnectFunction`
- `SendMessageFunction`
- `SetReadyFunction`
- `StartConversationFunction`
- `EndConversationFunction`
- `FetchChatHistoryFunction`
- `GetCurrentStateFunction`
- `UpdatePresenceFunction`
- `SyncConversationFunction`

### 5. Updated WebSocket Configuration

- **Stage Name**: Now uses `${Environment}` parameter instead of hardcoded "Dev"
- **WebSocket URL**: Updated to use `${Environment}` parameter
- **API Gateway Routes**: All route permissions updated to use `${Environment}`

### 6. Added Outputs

- `MatchmakingQueueTableName`: Exported table name for cross-stack references
- `MatchmakingQueueTableArn`: Exported table ARN for cross-stack references

### 7. SAM Configuration

- Updated `samconfig.toml` to include `Environment=Dev` parameter override
- Environment can be changed during deployment

## Benefits of Consolidation

### ✅ **Simplified Deployment**

- Single template to manage and deploy
- No need to coordinate multiple CloudFormation stacks
- Easier to maintain and version control

### ✅ **Environment Consistency**

- All resources use the same environment parameter
- Consistent naming across all tables and resources
- Easy to deploy to different environments

### ✅ **Reduced Complexity**

- Eliminated duplicate infrastructure definitions
- Single source of truth for all resources
- Easier to track dependencies and relationships

### ✅ **Better Maintainability**

- All infrastructure changes in one place
- Easier to review and audit changes
- Simplified rollback procedures

## Deployment

### Current Environment

```bash
# Deploy to Dev environment (default)
sam build && sam deploy

# Deploy to specific environment
sam build && sam deploy --parameter-overrides Environment=Staging
```

### Environment-Specific Deployments

```bash
# Staging
sam deploy --parameter-overrides Environment=Staging

# Production
sam deploy --parameter-overrides Environment=Prod
```

## Migration Notes

### What Was Removed

- `infrastructure/matchmaking-queue-table.yaml` - Deleted
- Standalone matchmaking queue deployment
- Separate environment-specific configurations

### What Was Added

- Environment parameter to main template
- Environment variables for all Lambda functions
- Exported table names and ARNs
- Environment-aware table naming

### What Was Updated

- All hardcoded "Dev" references → `${Environment}` parameter
- Table names now include environment suffix
- WebSocket stage and URL configurations
- SAM configuration with parameter overrides

## Testing

### Verify Environment Variables

All Lambda functions should now receive:

- `MATCHMAKING_QUEUE_TABLE`: `MatchmakingQueue-${Environment}`
- `USER_METADATA_TABLE`: `UserMetadataV2-${Environment}`
- `CONVERSATIONS_TABLE`: `ConversationsV3-${Environment}`
- `MESSAGES_TABLE`: `MessagesV2-${Environment}`

### Verify Table Names

After deployment, verify that tables are created with correct names:

- `MatchmakingQueue-Dev` (or your environment)
- `UserMetadataV2-Dev`
- `ConversationsV3-Dev`
- `MessagesV2-Dev`

## Future Considerations

### Multi-Environment Support

- Easy to add new environments by updating parameter values
- Consider using AWS Systems Manager Parameter Store for sensitive values
- Implement environment-specific configurations (e.g., different VPCs, security groups)

### Monitoring and Alerting

- Set up CloudWatch alarms for each environment
- Monitor table metrics and Lambda function performance
- Implement environment-specific logging levels

### Backup and Recovery

- Implement environment-specific backup strategies
- Test disaster recovery procedures for each environment
- Document rollback procedures for each environment

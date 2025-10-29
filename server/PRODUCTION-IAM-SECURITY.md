# Production IAM Security Implementation

## Overview

This document describes the implementation of least-privilege IAM policies for the production environment while maintaining broader permissions for development and staging environments.

## Security Model

### Environment-Conditional IAM Roles

The SAM template now implements two distinct IAM roles based on the deployment environment:

#### 1. NonProductionLambdaRole (Development & Staging)
- **Condition**: `IsNonProduction` (when Environment != "production")
- **Permissions**: Broad permissions for easier debugging and development
- **Managed Policies**:
  - `AWSLambdaBasicExecutionRole`
  - `AmazonAPIGatewayInvokeFullAccess`
  - `AmazonDynamoDBFullAccess`
- **Custom Policies**:
  - Parameter Store access to all `/mtjs/*` parameters

#### 2. ProductionLambdaRole (Production Only)
- **Condition**: `IsProduction` (when Environment == "production")
- **Permissions**: Least-privilege access to only required resources
- **Managed Policies**:
  - `AWSLambdaBasicExecutionRole` (CloudWatch Logs basic access)
- **Custom Policies**:
  - **DynamoDB**: Access only to the 4 production tables
  - **API Gateway**: PostToConnection only to production WebSocket API
  - **Parameter Store**: Read access only to `/mtjs/production/*`
  - **CloudWatch Logs**: Write access to production Lambda log groups

## Specific Production Permissions

### DynamoDB Access
```yaml
Actions:
  - dynamodb:GetItem
  - dynamodb:PutItem
  - dynamodb:UpdateItem
  - dynamodb:DeleteItem
  - dynamodb:Query
  - dynamodb:Scan
  - dynamodb:BatchGetItem
  - dynamodb:BatchWriteItem

Resources:
  - UserMetadataV2-production (including GSI)
  - MessagesV2-production
  - ConversationsV3-production
  - MatchmakingQueue-production (including GSI)
```

### API Gateway Access
```yaml
Actions:
  - execute-api:ManageConnections

Resources:
  - arn:aws:execute-api:region:account:api-id/production/POST/@connections/*
```

### Parameter Store Access
```yaml
Actions:
  - ssm:GetParameter
  - ssm:GetParameters
  - ssm:GetParametersByPath

Resources:
  - arn:aws:ssm:region:account:parameter/mtjs/production/*
```

### CloudWatch Logs Access
```yaml
Actions:
  - logs:CreateLogGroup
  - logs:CreateLogStream
  - logs:PutLogEvents

Resources:
  - arn:aws:logs:region:account:log-group:/aws/lambda/mtjs-*-production:*
```

## Security Benefits

### ✅ Production Environment
- **Zero Cross-Environment Access**: Cannot access dev/staging resources
- **Table-Specific Access**: Cannot access other DynamoDB tables
- **API-Specific Access**: Cannot invoke other API Gateway endpoints
- **Environment-Scoped Parameters**: Cannot read dev/staging secrets
- **Audit Trail**: All permissions explicitly defined and traceable

### ✅ Development/Staging Environments
- **Debugging Flexibility**: Broader permissions for troubleshooting
- **Rapid Development**: No permission barriers during development
- **Cross-Service Testing**: Can test integrations without permission issues

## Deployment Impact

### No Changes Required for Development/Staging
```bash
# These deployments work exactly as before
sam deploy                           # development (default)
sam deploy --config-env staging      # staging
```

### Production Deployment with Enhanced Security
```bash
# Production deployment now uses least-privilege policies
sam deploy --config-env production   # production (secure)
```

## Verification Commands

### Check Role Assignment
```bash
# Verify production uses ProductionLambdaRole
aws lambda get-function --function-name OnConnectFunction-production \
  --query 'Configuration.Role'

# Verify staging uses NonProductionLambdaRole  
aws lambda get-function --function-name OnConnectFunction-staging \
  --query 'Configuration.Role'
```

### Test Permissions
```bash
# Production Lambda should NOT be able to access staging tables
aws dynamodb describe-table --table-name UserMetadataV2-staging \
  --region us-east-1 # Should fail from production Lambda

# Production Lambda SHOULD be able to access production tables
aws dynamodb describe-table --table-name UserMetadataV2-production \
  --region us-east-1 # Should succeed from production Lambda
```

## Security Compliance

This implementation follows AWS security best practices:

1. **Principle of Least Privilege**: Production functions have minimal required permissions
2. **Environment Isolation**: No cross-environment access possible
3. **Resource-Specific Access**: Permissions scoped to exact resources needed
4. **Audit Compliance**: All permissions explicitly defined in CloudFormation
5. **Separation of Concerns**: Different permission models for different environments

## Troubleshooting

### Permission Denied Errors in Production
If you encounter permission errors in production:

1. **Check Resource ARNs**: Ensure the resource exists and matches the policy
2. **Verify Environment**: Confirm you're deploying to the correct environment
3. **Review CloudTrail**: Check AWS CloudTrail for detailed permission failures
4. **Test in Staging**: Verify the same operation works in staging first

### Adding New Permissions
To add new permissions for production:

1. Update the `ProductionLambdaRole` policies in `template.yaml`
2. Follow least-privilege principles (specific actions, specific resources)
3. Test in staging environment first
4. Deploy to production with `sam deploy --config-env production`

## Migration Notes

### Existing Deployments
- **Development/Staging**: No changes required, existing permissions maintained
- **Production**: First production deployment will create new least-privilege role
- **Rollback**: Can revert to previous template if needed

### New Deployments
All new deployments automatically use the appropriate security model based on environment.

# onConnect-ConnectionsTableAccess-v1.json

Purpose:

- Allow `onConnect` Lambda to read/write connection records during WebSocket $connect events.

Scope:

- Actions: dynamodb:GetItem, dynamodb:PutItem
- Resource: arn:aws:dynamodb:us-east-1:539247476190:table/Connections

Notes:

- No update, delete, or query permissions.
- Follows least-privilege security best practice.

# onConnect-ConnectionsTableAccess-v1.json

Purpose:

- Allow `onConnect` Lambda to read/write connection records during WebSocket $connect events.

Scope:

- Actions: dynamodb:GetItem, dynamodb:PutItem
- Resource: arn:aws:dynamodb:us-east-1:539247476190:table/Connections

Notes:

- No update, delete, or query permissions.
- Follows least-privilege security best practice.

# onDisconnect-ConnectionsTableAccess-v1.json

Purpose:

- Allow `onDisconnect` Lambda to remove connection records during WebSocket $disconnect events.

Scope:

- Actions: dynamodb:Scan, dynamodb:Update
- Resource: arn:aws:dynamodb:us-east-1:539247476190:table/Connections

Notes:

- Only scan and update permissions needed based on implementation.
- Follows least-privilege security best practice.

# sendMessage-MessageQueueHandlerInvoke-v1.json

Purpose:

- Allow the sendMessage Lambda to invoke the messageQueueHandler Lambda during WebSocket message send events.

Scope:

- Actions: lambda:InvokeFunction
- Resource: arn:aws:lambda:us-east-1:539247476190:function:messageQueueHandler

Notes:

- No permissions for managing, creating, or deleting functions — strictly invocation only.
- Follows least-privilege security best practice.

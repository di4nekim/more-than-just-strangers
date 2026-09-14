import { NextResponse } from 'next/server';
import { validateToken, handleAuthError } from '@/lib/auth';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const dynamoDB = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' })
);

export async function GET(request, { params }) {
  try {
    const { chatId } = await params;
    const { user } = await validateToken(request);
    const authenticatedUserId = user.uid || user.sub;

    // Authorization: the caller must be a participant in this conversation (prevents IDOR).
    const conversation = await dynamoDB.send(new GetCommand({
      TableName: process.env.CONVERSATIONS_TABLE || 'Conversations',
      Key: { PK: `CHAT#${chatId}` }
    }));
    if (!conversation.Item) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    if (
      conversation.Item.userAId !== authenticatedUserId &&
      conversation.Item.userBId !== authenticatedUserId
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    // Clamp the client-supplied limit so NaN/huge values never reach DynamoDB.
    const parsedLimit = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Number.isNaN(parsedLimit) ? 50 : Math.min(Math.max(parsedLimit, 1), 100);
    const before = searchParams.get('before');

    const queryParams = {
      TableName: process.env.MESSAGES_TABLE || 'MessagesV2',
      KeyConditionExpression: 'PK = :chatId',
      ExpressionAttributeValues: { ':chatId': `CHAT#${chatId}` },
      ScanIndexForward: false,
      Limit: limit
    };

    if (before) {
      try {
        queryParams.ExclusiveStartKey = JSON.parse(decodeURIComponent(before));
      } catch (error) {
//         // console.log('Invalid before parameter, ignoring:', error);
      }
    }
    
    const result = await dynamoDB.send(new QueryCommand(queryParams));
    
    return NextResponse.json({
      messages: (result.Items || []).map(msg => ({
        id: msg.messageId,
        content: msg.content,
        senderId: msg.senderId,
        timestamp: msg.sentAt,
        delivered: !msg.queued
      })),
      hasMore: !!result.LastEvaluatedKey,
      nextCursor: result.LastEvaluatedKey 
        ? encodeURIComponent(JSON.stringify(result.LastEvaluatedKey))
        : null
    });
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    const { error: errorMessage, status } = handleAuthError(error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}

export async function POST(request) {
  try {
    await validateToken(request);
    const { content } = await request.json();
    
    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Message content is required' },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Message sending is handled via WebSocket. Use the WebSocket connection to send messages.' },
      { status: 405 }
    );
  } catch (error) {
    console.error('Error sending chat message:', error);
    const { error: errorMessage, status } = handleAuthError(error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
} 
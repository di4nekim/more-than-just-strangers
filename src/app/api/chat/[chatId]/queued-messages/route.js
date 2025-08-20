import { NextResponse } from 'next/server';
import { validateToken, handleAuthError } from '@/lib/auth';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB client
const dynamoDbClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
});
const dynamoDB = DynamoDBDocumentClient.from(dynamoDbClient);

export async function GET(request, { params }) {
  try {
    const { user } = await validateToken(request);
    const userId = user.uid || user.sub;
    const { chatId } = params;

    console.log('Queued messages API: Request for chatId:', chatId, 'userId:', userId);

    if (!chatId) {
      return NextResponse.json(
        { error: 'Chat ID is required' },
        { status: 400 }
      );
    }

    // Debug environment variables
    console.log('Queued messages API: Environment variables check:');
    console.log('Queued messages API: MESSAGES_TABLE:', process.env.MESSAGES_TABLE);
    console.log('Queued messages API: AWS_REGION:', process.env.AWS_REGION);

    if (!process.env.MESSAGES_TABLE) {
      console.log('Queued messages API: MESSAGES_TABLE not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    try {
      // Query for queued messages in this chat where current user is the receiver
      const queryParams = {
        TableName: process.env.MESSAGES_TABLE,
        KeyConditionExpression: 'PK = :chatKey',
        FilterExpression: 'queued = :queued AND senderId <> :currentUserId',
        ExpressionAttributeValues: {
          ':chatKey': `CHAT#${chatId}`,
          ':queued': true,
          ':currentUserId': userId
        }
      };

      console.log('Queued messages API: Query params:', JSON.stringify(queryParams, null, 2));

      const result = await dynamoDB.send(new QueryCommand(queryParams));
      
      console.log('Queued messages API: Query result:', {
        itemCount: result.Items?.length || 0,
        scannedCount: result.ScannedCount,
        count: result.Count
      });

      const queuedMessages = (result.Items || []).map(msg => ({
        messageId: msg.messageId,
        message: msg.content, // Transform content to message for frontend compatibility
        senderId: msg.senderId,
        timestamp: msg.sentAt, // Transform sentAt to timestamp for frontend compatibility
        chatId: chatId,
        isQueued: true
      }));

      console.log('Queued messages API: Transformed messages:', queuedMessages.length);

      return NextResponse.json({
        queuedMessages,
        message: queuedMessages.length > 0 
          ? `Found ${queuedMessages.length} queued messages`
          : 'No queued messages found'
      });

    } catch (dbError) {
      console.error('Queued messages API: Database error:', dbError);
      return NextResponse.json(
        { error: 'Failed to fetch queued messages' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Queued messages API: General error:', error);
    const { error: errorMessage, status } = handleAuthError(error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
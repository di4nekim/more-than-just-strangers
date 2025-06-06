import { NextResponse } from 'next/server';
import AWS from 'aws-sdk';

const dynamoDB = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION,
});

// loads current chat for user, if exists
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
    }

    // Query for user's active chat using GSI1
    const params = {
      TableName: process.env.CONVERSATIONS_TABLE,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1_PK = :userKey',
      ExpressionAttributeValues: {
        ':userKey': `USER#${userId}`
      },
      ScanIndexForward: false, // most recent first
      Limit: 1
    };

    const result = await dynamoDB.query(params).promise();
    
    if (!result.Items || result.Items.length === 0) {
      return NextResponse.json({ chat: null });
    }

    const chat = result.Items[0];
    return NextResponse.json({ chat });

  } catch (error) {
    console.error('Error fetching chat:', error);
    return NextResponse.json({ error: 'Failed to fetch chat' }, { status: 500 });
  }
}

// matchmaking -> creates new chat
export async function POST(request) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ 
        error: 'Missing required parameter: userId' 
      }, { status: 400 });
    }

    // First check if user is already in a chat
    const existingChatParams = {
      TableName: process.env.CONVERSATIONS_TABLE,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1_PK = :userKey',
      ExpressionAttributeValues: {
        ':userKey': `USER#${userId}`
      },
      ScanIndexForward: false,
      Limit: 1
    };

    const existingChat = await dynamoDB.query(existingChatParams).promise();
    
    if (existingChat.Items && existingChat.Items.length > 0) {
      return NextResponse.json({ 
        error: 'User is already in a chat' 
      }, { status: 400 });
    }

    // Check if user is already queued
    const userMetadataParams = {
      TableName: process.env.USER_METADATA_TABLE,
      Key: { PK: `USER#${userId}` }
    };

    const userMetadata = await dynamoDB.get(userMetadataParams).promise();
    
    if (userMetadata.Item?.isQueued) {
      return NextResponse.json({ 
        status: 'waiting',
        queuedAt: userMetadata.Item.queuedAt
      });
    }

    // Mark user as queued
    const timestamp = new Date().toISOString();
    const updateUserParams = {
      TableName: process.env.USER_METADATA_TABLE,
      Key: { PK: `USER#${userId}` },
      UpdateExpression: 'SET isQueued = :isQueued, queuedAt = :queuedAt',
      ExpressionAttributeValues: {
        ':isQueued': true,
        ':queuedAt': timestamp
      }
    };

    await dynamoDB.update(updateUserParams).promise();

    // Look for an existing queued user (FIFO order)
    const scanParams = {
      TableName: process.env.USER_METADATA_TABLE,
      FilterExpression: 'isQueued = :isQueued AND PK <> :currentUser',
      ExpressionAttributeValues: {
        ':isQueued': true,
        ':currentUser': `USER#${userId}`
      }
    };

    const queuedUsers = await dynamoDB.scan(scanParams).promise();
    
    if (queuedUsers.Items && queuedUsers.Items.length > 0) {
      // Sort by queuedAt to ensure FIFO
      const sortedUsers = queuedUsers.Items.sort((a, b) => 
        new Date(a.queuedAt) - new Date(b.queuedAt)
      );
      
      const matchedUser = sortedUsers[0];
      const matchedUserId = matchedUser.PK.replace('USER#', '');

      // Create new chat
      const chatParticipants = [userId, matchedUserId].sort();
      const chatId = `${chatParticipants[0]}#${chatParticipants[1]}`;

      const conversationParams = {
        TableName: process.env.CONVERSATIONS_TABLE,
        Item: {
          PK: `CHAT#${chatId}`,
          chatId,
          participants: [userId, matchedUserId],
          lastMessage: null,
          lastUpdated: timestamp,
          endedBy: null,
          endReason: null,
          createdAt: timestamp,
        }
      };

      await dynamoDB.put(conversationParams).promise();

      // Update both users' metadata to clear queue status
      const updateMatchedUserParams = {
        TableName: process.env.USER_METADATA_TABLE,
        Key: { PK: `USER#${matchedUserId}` },
        UpdateExpression: 'REMOVE isQueued, queuedAt'
      };

      const updateCurrentUserParams = {
        TableName: process.env.USER_METADATA_TABLE,
        Key: { PK: `USER#${userId}` },
        UpdateExpression: 'REMOVE isQueued, queuedAt'
      };

      await Promise.all([
        dynamoDB.update(updateMatchedUserParams).promise(),
        dynamoDB.update(updateCurrentUserParams).promise()
      ]);

      return NextResponse.json({
        chat: {
          chatId,
          participants: [userId, matchedUserId],
          createdAt: timestamp
        }
      });
    }

    // No match found, return waiting status
    return NextResponse.json({
      status: 'waiting',
      queuedAt: timestamp
    });

  } catch (error) {
    console.error('Error in matchmaking:', error);
    return NextResponse.json({ error: 'Failed to process matchmaking' }, { status: 500 });
  }
}

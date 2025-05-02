import { NextResponse } from 'next/server';
import AWS from 'aws-sdk';

const dynamoDb = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION,
});

export async function POST(request) {
  try {
    const body = await request.json();
    const { chatId, beforeTimestamp } = body;

    if (!chatId || !beforeTimestamp) {
      return NextResponse.json({ error: 'Missing chatId or beforeTimestamp' }, { status: 400 });
    }

    // 1. Query for messages before the timestamp
    const queryParams = {
      TableName: process.env.MESSAGES_TABLE,
      KeyConditionExpression: "ChatID = :chatId AND #ts <= :beforeTimestamp",
      FilterExpression: "attribute_not_exists(ReadStatus) OR ReadStatus <> :read",
      ExpressionAttributeNames: {
        '#ts': 'Timestamp',  // aliases "Timestamp"
      },
      ExpressionAttributeValues: {
        ":chatId": chatId,
        ":beforeTimestamp": beforeTimestamp,
        ":read": "read"
      }
    };

    const { Items } = await dynamoDb.query(queryParams).promise();

    // 2. Batch update messages
    const updatePromises = (Items || [] ).map(item => {
      const updateParams = {
        TableName: process.env.MESSAGES_TABLE,
        Key: {
          ChatID: item.ChatID,
          Timestamp: item.Timestamp
        },
        UpdateExpression: "set ReadStatus = :read, ReadTimestamp = :readTimestamp",
        ExpressionAttributeValues: {
          ":read": "read",
          ":readTimestamp": new Date().toISOString()
        }
      };
      return dynamoDb.update(updateParams).promise();
    });

    await Promise.all(updatePromises);

    return NextResponse.json({ success: true, updated: Items.length });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    return NextResponse.json({ error: error.message || 'Failed to mark messages as read' }, { status: 500 });
  }
}

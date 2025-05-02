import { NextResponse } from 'next/server';
import AWS from 'aws-sdk';

const dynamoDb = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION, 
});

export async function POST(request) {
  try {
    console.log('Loading message historyfrom DynamoDB');

    const body = await request.json();
    console.log('Body received:', body);

    const chatId = body.chatId;

    if (!chatId) {
      return NextResponse.json({ error: 'Missing chatId parameter' }, { status: 400 });
    }

    const params = {
      TableName: process.env.MESSAGES_TABLE,
      KeyConditionExpression: "ChatID = :chatId",
      ExpressionAttributeValues: {
        ":chatId": chatId,
      },
      ScanIndexForward: false, // true = oldest first, false = newest first
      Limit: 50
    };

    const data = await dynamoDb.query(params).promise();
    return NextResponse.json({ messages: data.Items });
  } catch (error) {
    console.error('Error loading messages:', error);
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 });
  }
}

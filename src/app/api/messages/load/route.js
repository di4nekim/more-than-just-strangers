import { NextResponse } from 'next/server';
import AWS from 'aws-sdk';

const lambda = new AWS.Lambda({
  region: process.env.AWS_REGION,
});

export async function POST(request) {
  try {
    console.log('Loading message history via Lambda');

    const body = await request.json();
    console.log('Body received:', body);

    const chatId = body.chatId;

    if (!chatId) {
      return NextResponse.json({ error: 'Missing chatId parameter' }, { status: 400 });
    }

    const params = {
      FunctionName: process.env.LOAD_MESSAGES_LAMBDA,
      Payload: JSON.stringify({
        chatId: chatId,
        limit: 50
      })
    };

    const { Payload } = await lambda.invoke(params).promise();
    const response = JSON.parse(Payload);
    
    if (response.errorMessage) {
      throw new Error(response.errorMessage);
    }

    return NextResponse.json({ messages: response.body.Items });
  } catch (error) {
    console.error('Error loading messages:', error);
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 });
  }
}

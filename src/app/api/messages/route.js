import { NextResponse } from 'next/server';
import AWS from 'aws-sdk';

const lambda = new AWS.Lambda({
  region: process.env.AWS_REGION,
});

export async function GET(request) {
  try {
    console.log('Loading message history via Lambda');

    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('chatId');

    if (!chatId) {
      return NextResponse.json({ error: 'Missing chatId parameter' }, { status: 400 });
    }

    const params = {
      FunctionName: process.env.FETCH_CHAT_HISTORY_LAMBDA,
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

export async function POST(request) {
  try {
    console.log('Sending message via Lambda');

    const body = await request.json();
    console.log('Message body received:', body);

    const { chatId, content, senderId, messageId } = body;

    if (!chatId || !content || !senderId || !messageId) {
      return NextResponse.json({ 
        error: 'Missing required parameters: chatId, content, senderId, and messageId are required' 
      }, { status: 400 });
    }

    const params = {
      FunctionName: process.env.SEND_MESSAGE_LAMBDA,
      Payload: JSON.stringify({
        action: 'sendMessage',
        body: {
          chatId,
          messageId,
          senderId,
          content,
          sentAt: new Date().toISOString()
        }
      })
    };

    const { Payload } = await lambda.invoke(params).promise();
    const response = JSON.parse(Payload);
    
    if (response.errorMessage) {
      throw new Error(response.errorMessage);
    }

    return NextResponse.json({ success: true, message: response.body });
  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}

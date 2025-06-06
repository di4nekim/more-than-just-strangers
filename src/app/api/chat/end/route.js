import { NextResponse } from 'next/server';
import AWS from 'aws-sdk';

const lambda = new AWS.Lambda({
  region: process.env.AWS_REGION,
});

export async function POST(request) {
  try {
    const { userId, chatId } = await request.json();

    if (!userId || !chatId) {
      return NextResponse.json({ 
        error: 'Missing required parameters: userId and chatId are required' 
      }, { status: 400 });
    }

    const params = {
      FunctionName: process.env.END_CHAT_LAMBDA,
      Payload: JSON.stringify({
        userId,
        chatId,
        endedPrematurely: true
      })
    };

    const { Payload } = await lambda.invoke(params).promise();
    const response = JSON.parse(Payload);
    
    if (response.errorMessage) {
      throw new Error(response.errorMessage);
    }

    return NextResponse.json(response.body);
  } catch (error) {
    console.error('Error ending chat prematurely:', error);
    return NextResponse.json({ error: 'Failed to end chat' }, { status: 500 });
  }
}

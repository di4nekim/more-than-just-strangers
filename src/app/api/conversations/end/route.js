import { NextResponse } from 'next/server';
import AWS from 'aws-sdk';

const lambda = new AWS.Lambda({
  region: process.env.AWS_REGION,
});

export async function POST(request) {
  try {
    const { userId, chatId } = await request.json();

    const params = {
      FunctionName: process.env.END_CONVERSATION_LAMBDA,
      Payload: JSON.stringify({
        userId,
        chatId
      })
    };

    const { Payload } = await lambda.invoke(params).promise();
    const response = JSON.parse(Payload);
    
    if (response.errorMessage) {
      throw new Error(response.errorMessage);
    }

    return NextResponse.json(response.body);
  } catch (error) {
    console.error('Error ending conversation:', error);
    return NextResponse.json({ error: 'Failed to end conversation' }, { status: 500 });
  }
} 
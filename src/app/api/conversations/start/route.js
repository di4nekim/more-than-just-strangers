import { NextResponse } from 'next/server';
import AWS from 'aws-sdk';

const lambda = new AWS.Lambda({
  region: process.env.AWS_REGION,
});

export async function POST(request) {
  try {
    const { userId } = await request.json();

    const params = {
      FunctionName: process.env.START_CONVERSATION_LAMBDA,
      Payload: JSON.stringify({
        userId
      })
    };

    const { Payload } = await lambda.invoke(params).promise();
    const response = JSON.parse(Payload);
    
    if (response.errorMessage) {
      throw new Error(response.errorMessage);
    }

    return NextResponse.json(response.body);
  } catch (error) {
    console.error('Error starting conversation:', error);
    return NextResponse.json({ error: 'Failed to start conversation' }, { status: 500 });
  }
} 
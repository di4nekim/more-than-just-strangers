import { NextResponse } from 'next/server';
import AWS from 'aws-sdk';

const lambda = new AWS.Lambda({
  region: process.env.AWS_REGION,
});

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
    }

    const params = {
      FunctionName: process.env.GET_CURRENT_STATE_LAMBDA,
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
    console.error('Error getting current state:', error);
    return NextResponse.json({ error: 'Failed to get current state' }, { status: 500 });
  }
} 
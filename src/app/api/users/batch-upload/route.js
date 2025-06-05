import { NextResponse } from 'next/server';
import AWS from 'aws-sdk';

const lambda = new AWS.Lambda({
  region: process.env.AWS_REGION,
});

export async function POST(request) {
  try {
    const { users } = await request.json();

    if (!users || !Array.isArray(users)) {
      return NextResponse.json({ error: 'Invalid users data' }, { status: 400 });
    }

    const params = {
      FunctionName: process.env.BATCH_COGNITO_UPLOAD_LAMBDA,
      Payload: JSON.stringify({
        users
      })
    };

    const { Payload } = await lambda.invoke(params).promise();
    const response = JSON.parse(Payload);
    
    if (response.errorMessage) {
      throw new Error(response.errorMessage);
    }

    return NextResponse.json(response.body);
  } catch (error) {
    console.error('Error in batch Cognito upload:', error);
    return NextResponse.json({ error: 'Failed to process batch upload' }, { status: 500 });
  }
} 
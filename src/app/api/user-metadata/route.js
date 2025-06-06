import { DynamoDB } from 'aws-sdk';
import { NextResponse } from 'next/server';

const dynamoDB = new DynamoDB.DocumentClient();
const USER_METADATA_TABLE = process.env.USER_METADATA_TABLE;

export async function POST(request) {
  try {
    const { userIds } = await request.json();

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request: userIds must be a non-empty array' },
        { status: 400 }
      );
    }

    // Batch get items from DynamoDB
    const batchGetParams = {
      RequestItems: {
        [USER_METADATA_TABLE]: {
          Keys: userIds.map(userId => ({ PK: `USER#${userId}` }))
        }
      }
    };

    const result = await dynamoDB.batchGet(batchGetParams).promise();
    const userMetadata = result.Responses[USER_METADATA_TABLE];

    // Handle unprocessed keys if any
    if (result.UnprocessedKeys && Object.keys(result.UnprocessedKeys).length > 0) {
      // Retry unprocessed keys
      const retryResult = await dynamoDB.batchGet({
        RequestItems: result.UnprocessedKeys
      }).promise();
      
      if (retryResult.Responses[USER_METADATA_TABLE]) {
        userMetadata.push(...retryResult.Responses[USER_METADATA_TABLE]);
      }
    }

    // Transform the response to remove the USER# prefix from PKs
    const transformedMetadata = userMetadata.map(item => ({
      ...item,
      userId: item.PK.replace('USER#', ''),
      PK: undefined // Remove the PK field from the response
    }));

    return NextResponse.json({ users: transformedMetadata });
  } catch (error) {
    console.error('Error fetching user metadata:', error);
    
    if (error.code === 'ResourceNotFoundException') {
      return NextResponse.json(
        { error: 'Database table not found' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch user metadata' },
      { status: 500 }
    );
  }
}

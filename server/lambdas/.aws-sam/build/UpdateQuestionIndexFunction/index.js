const AWS = require('aws-sdk');

AWS.config.update({ region: process.env.AWS_REGION || 'us-east-1' });
// config document client for local dev via DynamoDB Local + Docker
const isLocal = !!process.env.DYNAMODB_ENDPOINT;
const dynamodb = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
    accessKeyId: isLocal ? "fake" : undefined,
    secretAccessKey: isLocal ? "fake" : undefined,
});

exports.handler = async (event) => {
  try {
    const userId = event.requestContext?.userId || event.requestContext?.authorizer?.principalId;
    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing userId in requestContext' }),
      };
    }

    const body = JSON.parse(event.body);
    const { direction } = body; // 'next' or 'previous'

    if (!['next', 'previous'].includes(direction)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid direction. Use "next" or "previous".' }),
      };
    }

    // Use UpdateExpression to increment or decrement
    const updateParams = {
      TableName: process.env.USER_METADATA_TABLE,
      Key: { UserID: userId },
      UpdateExpression: `SET questionIndex = if_not_exists(questionIndex, :zero) ${direction === 'next' ? '+' : '-'} :one`,
      ExpressionAttributeValues: {
        ':one': 1,
        ':zero': 0,
      },
      ReturnValues: 'UPDATED_NEW',
    };

    console.log('Using TableName:', updateParams.TableName);

    const result = await dynamoDb.update(updateParams).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Question index ${direction === 'next' ? 'incremented' : 'decremented'}`,
        newIndex: result.Attributes.questionIndex,
      }),
    };
  } catch (err) {
    console.error('Error updating questionIndex:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to update questionIndex' }),
    };
  }
};

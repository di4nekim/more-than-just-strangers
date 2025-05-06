import AWS from 'aws-sdk';

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const USER_METADATA_TABLE = process.env.USER_METADATA_TABLE;

export async function POST(request) {
  const { userId } = await request.json();

  try {
      const result = await dynamoDb.get({
        TableName: USER_METADATA_TABLE,
        Key: { UserID: userId },
        ProjectionExpression: 'questionIndex',
      }).promise();
      
      
      if (!result.Item || result.Item.questionIndex === null) {
        return new Response(JSON.stringify({ error: 'No questionIndex not found' }), { status: 404 });
      }
  
      const index = result.Item?.questionIndex ?? 0;
  
      return new Response(JSON.stringify({ questionIndex: index }), { status: 200 });
    } catch (error) {
      console.error('Error fetching question index:', error);
      return new Response(JSON.stringify({ error: 'Failed to fetch question index' }), { status: 500 });
    }
}
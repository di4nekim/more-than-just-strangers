const AWS = require('aws-sdk-mock');
const { handler } = require('../updateQuestionIndex/index');

AWS.setSDKInstance(require('aws-sdk'));

describe('updateQuestionIndex Lambda Function', () => {
  let fakeIdx;

  const sampleEvent = {
    requestContext: {
      userId: 'test-user-id',
    },
    body: JSON.stringify({
      direction: 'next',
    }),
  };

  beforeAll(() => {
    process.env.USER_METADATA_TABLE = 'UserMetadata';
    // process.env.USER_METADATA_TABLE = 'test-user-metadata-table';
    process.env.AWS_REGION = 'us-east-1';
  });

  beforeEach(() => {
    fakeIdx = 0;

    AWS.mock('DynamoDB.DocumentClient', 'update', (params, callback) => {
      if (params.TableName !== process.env.USER_METADATA_TABLE) {
        callback(new Error('Incorrect TableName in params'));
        return;
      }

      if (params.UpdateExpression.includes('+')) {
        fakeIdx += 1;
      } else if (params.UpdateExpression.includes('-')) {
        fakeIdx -= 1;
      }
      
      console.log('fakeIdx', fakeIdx)
      callback(null, { Attributes: { questionIndex: fakeIdx } });
    });
  });

  afterEach(() => {
    AWS.restore('DynamoDB.DocumentClient');
  });

  it('should increment questionIndex when direction is next', async () => {
    const response = await handler(sampleEvent);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.message).toBe('Question index incremented');
    expect(body.newIndex).toBe(1);
  });

  it('should return an error for invalid direction', async () => {
    const invalidEvent = { ...sampleEvent, body: JSON.stringify({ direction: 'invalid' }) };

    const response = await handler(invalidEvent);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(400);
    expect(body.error).toBe('Invalid direction. Use "next" or "previous".');
  });

  it('should handle DynamoDB update errors gracefully', async () => {
    AWS.restore('DynamoDB.DocumentClient'); // Clear the increment mock
    AWS.mock('DynamoDB.DocumentClient', 'update', (params, callback) => {
      callback(new Error('DynamoDB error'));
    });

    const response = await handler(sampleEvent);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(500);
    expect(body.error).toBe('Failed to update questionIndex');
  });
});

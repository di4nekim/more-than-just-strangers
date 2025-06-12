/**
 * Lambda function to handle new WebSocket connections.
 * Stores the connection ID in DynamoDB and validates that it doesn't already exist.
 * 
 * @param {Object} event - The event object containing the WebSocket connection details
 * @returns {Object} Response object with status code and body
 */
const AWS = require('aws-sdk');

module.exports.handler = async (event) => {
    // console.log('Lambda triggered with event:', JSON.stringify(event));
    
    try {
        // validate that we have a connectionId
        if (!event.requestContext || !event.requestContext.connectionId) {
            console.error('No connectionId found in event');
            return { 
                statusCode: 400, 
                body: JSON.stringify({ 
                    error: 'Missing connectionId in request'
                })
            };
        }

        const connectionId = event.requestContext.connectionId;
        // const userId = event.queryStringParameters?.userId;
        const userId = 'userA';
        const tableName = process.env.USER_METADATA_TABLE || 'UserMetadata';
        console.log(`New WebSocket connection established: ${connectionId}`);

        // Configure DynamoDB DocumentClient for AWS
        const dynamoDB = new AWS.DynamoDB.DocumentClient({
            region: process.env.AWS_REGION || 'us-east-1'
        });

        // check if user exists
        const userKey = { PK: `USER#${userId}` };
        console.log('Checking for user with key:', userKey);
        
        const userExists = await dynamoDB.get({
            TableName: tableName,
            Key: userKey
        }).promise();
        
        if (!userExists.Item) {
            try {
                const newUser = {
                    ...userKey,
                    connectionId,
                    createdAt: new Date().toISOString()
                };
                console.log('Creating new user:', newUser);
                
                await dynamoDB.put({
                    TableName: tableName,
                    Item: newUser
                }).promise();
                
                return {
                    statusCode: 200,
                    body: JSON.stringify({ message: 'New user connection established', connectionId })
                };
            } catch (error) {
                console.error('Error creating user:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Internal Server Error' })
                };
            }
        }
        else {
            // update already existing user metadata with connectionId   
            try {
                console.log('Updating existing user:', userKey);
                
                await dynamoDB.update({
                    TableName: tableName,
                    Key: userKey,
                    UpdateExpression: 'SET connectionId = :connectionId, lastUpdated = :now',
                    ExpressionAttributeValues: {
                        ':connectionId': connectionId,
                        ':now': new Date().toISOString()
                    }
                }).promise();
    
                return {
                    statusCode: 200,
                    body: JSON.stringify({ message: 'Connection established', connectionId })
                };
            } catch (error) {
                console.error('Error storing connection:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ error: 'Internal Server Error' })
                };
            }
        }

    } catch (error) {
        console.error('Error in onConnect:', error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: 'Internal Server Error' })
        };
    }
};
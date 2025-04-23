import dotenv from 'dotenv';
import { createDynamoDB } from './config/aws';
import { v4 as uuidv4 } from 'uuid';
dotenv.config({ path: '.env.local' });

// stores connection ID in dynamoDB
// modified to deliver msgs in messageQueue, if exists

export const handler = async (event) => {
    const dynamoDB = createDynamoDB();
    const connectionId = event.requestContext.connectionId;

    try {
        // Check if connection already exists
        const getParams = {
            TableName: process.env.CONNECTIONS_TABLE,
            Key: {
                ConnectionID: connectionId
            }
        };

        const existingConnection = await dynamoDB.get(getParams).promise();
        if (existingConnection.Item) {
            return { statusCode: 409, body: 'Connection already exists' };
        }

        // Store the connection
        const putParams = {
            TableName: process.env.CONNECTIONS_TABLE,
            Item: {
                ConnectionID: connectionId,
                timestamp: new Date().toISOString()
            }
        };

        await dynamoDB.put(putParams).promise();

        return { statusCode: 200, body: 'Connected successfully' };
    } catch (error) {
        console.error('Error in onConnect:', error);
        return { statusCode: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
    }
};
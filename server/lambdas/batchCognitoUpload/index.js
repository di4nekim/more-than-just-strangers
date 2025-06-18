const { CognitoIdentityProviderClient, ListUsersCommand } = require("@aws-sdk/client-cognito-identity-provider");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const questions = require('../questions.json');

// Configure AWS SDK v3 clients
const cognitoClient = new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION || 'us-east-1'
});

const dynamoDbClient = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1'
});
const dynamodb = DynamoDBDocumentClient.from(dynamoDbClient);

// TODO: FULLY UPDATE BASED ON NEW SCHEMA

async function getAllUsers() {
    /** @type {{sub: string, name: string, email: string}[]} */
    const users = [];
    const response = await cognitoClient.send(new ListUsersCommand({ 
        UserPoolId: process.env.COGNITO_USER_POOL_ID || '' 
    }));

    if (response.Users) {
        response.Users.forEach(user => {
            if (!user.Attributes) return;
            const subAttr = user.Attributes.find(attr => attr.Name === 'sub');
            const sub = subAttr ? subAttr.Value : '';
            if (!sub) return; // skip if no sub
            const name = user.Attributes.find(attr => attr.Name === 'name')?.Value || 'Unknown';
            const email = user.Attributes.find(attr => attr.Name === 'email')?.Value || 'No Email';
            users.push({ sub, name, email });
        });
    }

    return users;
}

/**
 * @param {{sub: string, name: string, email: string}[]} users
 */
async function storeUsersInDynamoDB(users) {
    const promises = users.map(user => {
        return dynamodb.send(new PutCommand({
            TableName: process.env.USER_METADATA_TABLE || '',
            Item: {
                PK: user.sub,
                Name: user.name,
                Email: user.email,
                IsOnline: false,
                LastActive: 'Never',
                IsTyping: false,
                OnlineStatus: 'Offline',
                CurrChatPartnerID: '',
                QuestionIndex: 0,
                ready: false,
                // connectionId: '',
                state: 'AWAITING_CONFIRMATION',
                TTL: Math.floor(Date.now() / 1000) + 3600
            }
        }));
    });

    await Promise.all(promises);
}

/**
 * @param {*} event
 * @param {*} context
 */
module.exports.handler = async (event, context) => {
    const cognitoUsers = await getAllUsers();
    await storeUsersInDynamoDB(cognitoUsers);
    return {
        statusCode: 200,
        body: 'Users successfully added!'
    };
}; 
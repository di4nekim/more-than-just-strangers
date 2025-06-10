const AWS = require('aws-sdk');
const questions = require('../questions.json');

const cognito = new AWS.CognitoIdentityServiceProvider();

// config document client for local dev via DynamoDB Local + Docker
const isLocal = !!process.env.DYNAMODB_ENDPOINT;
const dynamodb = new AWS.DynamoDB.DocumentClient({
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.DYNAMODB_ENDPOINT || undefined,
    accessKeyId: isLocal ? "fake" : undefined,
    secretAccessKey: isLocal ? "fake" : undefined,
});


async function getAllUsers() {
    /** @type {{sub: string, name: string, email: string}[]} */
    const users = [];
    const response = await cognito.listUsers({ UserPoolId: process.env.COGNITO_USER_POOL_ID || '' }).promise();

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
        return dynamodb.put({
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
                readyToAdvance: false,
                // connectionId: '',
                state: 'AWAITING_CONFIRMATION',
                TTL: Math.floor(Date.now() / 1000) + 3600
            }
        }).promise();
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
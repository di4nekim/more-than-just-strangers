const AWS = require('aws-sdk');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamodb = new AWS.DynamoDB.DocumentClient();

// const USER_POOL_ID = 'eu-north-1';
const USER_POOL_ID = process.env.AWS_REGION;
const DYNAMODB_TABLE = "UserMetaData";

async function getAllUsers() {
    const users = [];
    const response = await cognito.listUsers({ UserPoolId: USER_POOL_ID }).promise();

    response.Users.forEach(user => {
        const userData = {
            sub: user.Attributes.find(attr => attr.Name === 'sub').Value,
            name: user.Attributes.find(attr => attr.Name === 'name')?.Value || 'Unknown',
            email: user.Attributes.find(attr => attr.Name === 'email')?.Value || 'No Email'
        };
        users.push(userData);
    });

    return users;
}

async function storeUsersInDynamoDB(users) {
    const promises = users.map(user => {
        return dynamodb.put({
            TableName: DYNAMODB_TABLE,
            Item: {
                PK: user.sub,
                Name: user.name,
                Email: user.email,
                IsOnline: false,
                LastActive: 'Never',
                IsTyping: false,
                OnlineStatus: 'Offline',
                CurrChatPartnerID: '',
                TTL: Math.floor(Date.now() / 1000) + 3600
            }
        }).promise();
    });

    await Promise.all(promises);
}

export const handler = async (event, context) => {
    const cognitoUsers = await getAllUsers();
    await storeUsersInDynamoDB(cognitoUsers);
    return {
        statusCode: 200,
        body: 'Users successfully added!'
    };
}; 
const AWS = require('aws-sdk');
const questions = require('../questions.json');

const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamodb = new AWS.DynamoDB.DocumentClient();

// const USER_POOL_ID = process.env.AWS_REGION;
// const USER_METADATA_TABLE = process.env.USER_METADATA_TABLE;

async function getAllUsers() {
    const users = [];
    const response = await cognito.listUsers({ UserPoolId: process.env.AWS_REGION }).promise();

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
            TableName: process.env.USER_METADATA_TABLE,
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
                TTL: Math.floor(Date.now() / 1000) + 3600
            }
        }).promise();
    });

    await Promise.all(promises);
}

module.exports.handler = async (event, context) => {
    const cognitoUsers = await getAllUsers();
    await storeUsersInDynamoDB(cognitoUsers);
    return {
        statusCode: 200,
        body: 'Users successfully added!'
    };
}; 
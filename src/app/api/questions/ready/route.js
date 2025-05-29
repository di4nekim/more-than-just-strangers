import AWS from "aws-sdk";

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const apiGateway = new AWS.ApiGatewayManagementApi({
  endpoint: process.env.WEBSOCKET_ENDPOINT,
});
const USER_METADATA_TABLE = process.env.USER_METADATA_TABLE;

async function postToConnection(connectionId, message) {
  try {
    await apiGateway.postToConnection({
      ConnectionId: connectionId,
      Data: message,
    }).promise();
  } catch (error) {
    console.error('Error posting to connection:', error);
    return new Response(JSON.stringify({ error: 'Failed to post to connection' }), { status: 500 });
  }
}

export async function POST(request) {
  const { userId, chatId, readyToAdvance } = await request.json();
  let bothReady = false;
  let updatedQuestionIndex = null;

  // Update the user's ready to advance status
  try {
    const params = {
      TableName: USER_METADATA_TABLE,
      Key: { UserID: userId },
      UpdateExpression: 'SET readyToAdvance = :readyToAdvance',
      ExpressionAttributeValues: {
        ':readyToAdvance': readyToAdvance,
      },
    }
    await dynamoDb.update(params).promise();

  } catch (error) {
    console.error('Error updating ready to advance:', error);
    return new Response(JSON.stringify({ error: 'Failed to update ready to advance' }), { status: 500 });
  }
  
  try {

    // get the other user's metadata (readyToAdvance status)
    const otherUserId = chatId.split('#').find(id => id !== userId);
    const result = await dynamoDb.get({
      TableName: USER_METADATA_TABLE,
      Key: { UserID: otherUserId },
      ProjectionExpression: 'readyToAdvance',
    }).promise();
    
    const otherUserMetadata = result.Item;
    if (!otherUserMetadata) {
      return new Response(JSON.stringify({ message: 'Other user ID not found' }), { status: 200 });
    }

    if (!readyToAdvance || !otherUserMetadata.readyToAdvance) {
      return new Response(JSON.stringify({message: "User is not readyToAdvance"}), { status: 200 });
    }

    // If both users are ready to advance:
    if (readyToAdvance && otherUserMetadata.readyToAdvance) {
      bothReady = true;

      // Increment questionIndex for both users + reset readyToAdvance
      const updatedUser = await dynamoDb.update({
          TableName: USER_METADATA_TABLE,
          Key: { UserID: userId },
          UpdateExpression: 'SET questionIndex = questionIndex + :increment, readyToAdvance = :readyToAdvance',
          ExpressionAttributeValues: {  
            ':increment': 1,
            ':readyToAdvance': false,
          },
          ReturnValues: 'UPDATED_NEW',
      }).promise();

      await dynamoDb.update({
          TableName: USER_METADATA_TABLE, 
          Key: { UserID: otherUserId },
          UpdateExpression: 'SET questionIndex = questionIndex + :increment, readyToAdvance = :readyToAdvance',
          ExpressionAttributeValues: {
            ':increment': 1,
            ':readyToAdvance': false,
          },
          ReturnValues: 'UPDATED_NEW',
      }).promise();
      
      updatedQuestionIndex = updatedUser.Attributes?.questionIndex;
      
      // query the connections table for the other user's connection id
      const userConnectionQuery = await dynamoDb.get({
        TableName: process.env.CONNECTIONS_TABLE,
        Key: { UserID: userId },
      }).promise();
      const userConnectionId = userConnectionQuery.Item.ConnectionID;
      if (!userConnectionId) {
        return new Response(JSON.stringify({ error: 'User connection not found' }), { status: 404 });
      }

      const otherUserConnectionQuery = await dynamoDb.get({
        TableName: process.env.CONNECTIONS_TABLE,
        Key: { UserID: otherUserId },
      }).promise();

      let otherUserConnectionId;
      if (!otherUserConnectionQuery.Item || !otherUserConnectionQuery.Item.ConnectionID) {
        return new Response(JSON.stringify({ error: 'Other user connection not found' }), { status: 404 });
      } else {
        otherUserConnectionId = otherUserConnectionQuery.Item.ConnectionID;
      }
      
      // Send a Websocket postToConnection() to each connected client
      await postToConnection(userConnectionId, JSON.stringify({
        action: 'advanceQuestion',
        questionIndex: updatedQuestionIndex,
      }));
      await postToConnection(otherUserConnectionId, JSON.stringify({
        action: 'advanceQuestion',
        questionIndex: updatedQuestionIndex,
      }));

      // if end of conversation, send websocket broadcast to both users
      if (updatedQuestionIndex === 36) {
        await postToConnection(userConnectionId, JSON.stringify({
          action: 'congrats',
        }));
        await postToConnection(otherUserConnectionId, JSON.stringify({
          action: 'congrats',
        }));
      }

      return new Response(JSON.stringify({ "bothReady": bothReady, "newQuestionIndex": updatedQuestionIndex, "peerReady": otherUserMetadata.readyToAdvance }), { status: 200 });
    }

    return new Response(JSON.stringify({message: "Both are not ready"}), { status: 200 });
    // return new Response(JSON.stringify({ "bothReady": bothReady, "newQuestionIndex": updatedQuestionIndex, "peerReady": otherUserMetadata.readyToAdvance }), { status: 200 });
  }
  catch (error) {
    console.error('Error fetching user metadata:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch user metadata' }), { status: 500 });
  }
}
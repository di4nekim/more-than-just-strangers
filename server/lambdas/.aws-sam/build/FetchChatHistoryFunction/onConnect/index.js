/**
 * Lambda function to handle new WebSocket connections.
 * Simply accepts connections without authentication - user data will be stored
 * when the first authentication message is received.
 * 
 * @param {Object} event - The event object containing the WebSocket connection details
 * @returns {Object} Response object with status code and body
 */

// Main handler logic
const handlerLogic = async (event) => {
    console.log('Lambda triggered with event:', JSON.stringify(event, null, 2));
    
    try {
        // Validate that we have a connectionId
        if (!event.requestContext || !event.requestContext.connectionId) {
            console.error('No connectionId found in event');
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: 'Missing connectionId in request',
                    message: 'Connection ID is required'
                })
            };
        }

        const connectionId = event.requestContext.connectionId;
        console.log(`New WebSocket connection established: ${connectionId} (waiting for authentication)`);

        // Simply accept the connection - no need to store anything yet
        // User data will be stored when the first authentication message is received
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Connection established, waiting for authentication',
                connectionId: connectionId,
                status: 'connected'
            })
        };
        
    } catch (error) {
        console.error('Error in handler logic:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: error.message
            })
        };
    }
};

// Export the handler without authentication middleware
module.exports.handler = handlerLogic;
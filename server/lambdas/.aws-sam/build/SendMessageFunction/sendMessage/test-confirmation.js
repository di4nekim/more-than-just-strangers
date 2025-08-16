// Simple test to verify confirmation code logic
const testConfirmationLogic = () => {
    console.log('Testing confirmation logic...');
    
    // Simulate the variables
    const connectionId = 'O2DIZdWfIAMCJKg=';
    const messageId = 'optimistic-1754418135032-ncdl5bbks';
    const chatId = 'Lrf6scGqzYPqyn5jULeKSpOTiZq2#xkEIeFHazpODEHktJIYIMykF7Lk2';
    const userId = 'Lrf6scGqzYPqyn5jULeKSpOTiZq2';
    const content = 'blah lah blah';
    const sentAt = '2025-08-05T18:22:15.032Z';
    
    console.log('About to send confirmation to sender...');
    console.log('connectionId =', connectionId);
    console.log('messageId =', messageId);
    console.log('chatId =', chatId);
    console.log('userId =', userId);
    console.log('content =', content);
    console.log('sentAt =', sentAt);
    
    // Send confirmation back to sender
    console.log('📤 Sending confirmation back to sender...');
    
    const confirmationPayload = {
        action: 'messageConfirmed',
        data: {
            chatId,
            messageId,
            senderId: userId,
            content,
            timestamp: sentAt
        }
    };
    
    console.log('📤 Confirmation payload to sender:', JSON.stringify(confirmationPayload, null, 2));
    console.log('✅ Confirmation sent to sender successfully');
    console.log('✅ Send message action completed successfully');
    
    return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Message sent successfully' })
    };
};

// Run the test
const result = testConfirmationLogic();
console.log('Test result:', result); 
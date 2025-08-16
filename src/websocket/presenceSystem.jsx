import { useWebSocket } from './WebSocketContext';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useDebounce } from '../hooks/useDebounce';

/**
 * @typedef {'online'|'offline'|'away'} PresenceStatus
 */

export const usePresenceSystem = () => {
  const { wsActions, userMetadata, userProfile, isConnected } = useWebSocket();
  const [localStatus, setLocalStatus] = useState('online');
  const debouncedStatus = useDebounce(localStatus, 1000);
  
  // Use refs to track the last sent values to prevent unnecessary updates
  const lastSentRef = useRef({ status: null, userId: null, chatId: null });

  useEffect(() => {
    // Only send presence updates if WebSocket is connected and we have all required data
    if (!isConnected || !wsActions || !userMetadata.userId || !userMetadata.chatId) {
      return;
    }

    // Check if we've already sent this exact status for this user/chat combination
    const currentValues = {
      status: debouncedStatus,
      userId: userMetadata.userId,
      chatId: userMetadata.chatId
    };

    if (
      lastSentRef.current.status === currentValues.status &&
      lastSentRef.current.userId === currentValues.userId &&
      lastSentRef.current.chatId === currentValues.chatId
    ) {
      return; // Skip if we've already sent this exact update
    }

    const sendPresenceUpdate = async () => {
      try {
        if (process.env.NODE_ENV === 'development') {
          console.log('PresenceSystem: Sending debounced presence update:', {
            userId: userMetadata.userId,
            chatId: userMetadata.chatId,
            status: 'online'
          });
        }
        
        await wsActions.updatePresence({
          chatId: userMetadata.chatId,
          userId: userMetadata.userId,
          status: debouncedStatus
        });
        
        // Update the last sent values
        lastSentRef.current = currentValues;
        
        if (process.env.NODE_ENV === 'development') {
          console.log('PresenceSystem: Debounced presence update sent successfully');
        }
      } catch (error) {
        console.warn('Failed to send presence update:', error);
        // Don't throw - presence updates are not critical
      }
    };

    sendPresenceUpdate();
  }, [debouncedStatus, wsActions, userMetadata.userId, userMetadata.chatId, isConnected]);

  // Auto-update presence when required data becomes available
  useEffect(() => {
    if (isConnected && wsActions && userMetadata.userId && userMetadata.chatId) {
      // Send current status when data becomes available
      const sendCurrentStatus = async () => {
        try {
          if (process.env.NODE_ENV === 'development') {
            console.log('PresenceSystem: Sending initial presence update:', {
              userId: userMetadata.userId,
              chatId: userMetadata.chatId,
              status: 'online'
            });
          }
          
          await wsActions.updatePresence({
            chatId: userMetadata.chatId,
            userId: userMetadata.userId,
            status: localStatus
          });
          
          // Update the last sent values
          lastSentRef.current = {
            status: localStatus,
            userId: userMetadata.userId,
            chatId: userMetadata.chatId
          };
          
          if (process.env.NODE_ENV === 'development') {
            console.log('PresenceSystem: Initial presence update sent successfully');
          }
        } catch (error) {
          console.warn('Failed to send initial presence update:', error);
        }
      };
      
      sendCurrentStatus();
    }
  }, [isConnected, wsActions, userMetadata.userId, userMetadata.chatId, localStatus]);

  /**
   * @param {PresenceStatus} status
   */
  const updatePresence = useCallback(async (status) => {
    // Check if we have all required data
    const hasRequiredData = wsActions && userMetadata.chatId && userMetadata.userId;
    
    if (!hasRequiredData) {
      // Only log warning in development mode and provide more detailed info
      if (process.env.NODE_ENV === 'development') {
        console.warn('PresenceSystem: Cannot update presence - missing required data', {
          userId: userMetadata.userId,
          chatId: userMetadata.chatId,
          hasWsActions: !!wsActions
        });
      }
      return;
    }

    try {
      await wsActions.updatePresence({
        chatId: userMetadata.chatId,
        userId: userMetadata.userId,
        status,
        lastSeen: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to update presence:', error);
    }
  }, [wsActions, userMetadata.chatId, userMetadata.userId]);

  return {
    currentStatus: localStatus,
    updatePresence,
    setLocalStatus
  };
}; 
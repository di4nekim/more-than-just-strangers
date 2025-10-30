'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useFirebaseAuth } from './auth/FirebaseAuthProvider';
import { useWebSocket } from '../../websocket/WebSocketContext';
import { apiClient } from '../lib/api-client';
import HOME_BG from '../../../public/HOME_BG.svg';

export default function HomeContent() {
  const router = useRouter();
  
  // Firebase Auth state
  const { user, loading: authLoading, signOut } = useFirebaseAuth();
  const isAuthenticated = !!user;
  
  // WebSocket hooks  
  const {
    userMetadata,
    conversationMetadata,
    hasActiveChat,
    isConnected: wsConnected,
    initializeUser,
    startNewChat,
    endChat,
    initState,
    wsActions, // Added wsActions to the hook
    wsClient // Added wsClient to the hook
  } = useWebSocket();
  
  // Key State
  const [currentChatId, setCurrentChatId] = useState(null);
  const [isInMatchmakingQueue, setIsInMatchmakingQueue] = useState(false);
  const [isConversationActive, setIsConversationActive] = useState(false);
  const [connectionId, setConnectionId] = useState(null);
  const [showConversationDropdown, setShowConversationDropdown] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [partnerName, setPartnerName] = useState("Anonymous");
  const [showEndDialog, setShowEndDialog] = useState(false);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    
    setIsSigningOut(true);
    
    try {
      setError(null);
      
      if (currentChatId && isConversationActive) {
        try {
          await endChat(currentChatId, 'user_signed_out');
        } catch (error) {
//           // console.warn('Failed to end conversation during sign out:', error);
        }
      }
      
      if (isInMatchmakingQueue && wsActions) {
        try {
          await wsActions.setReady({ ready: false });
        } catch (error) {
//           // console.warn('Failed to remove from matchmaking queue during sign out:', error);
        }
      }
      
      if (wsClient) {
        try {
          wsClient.disconnect();
        } catch (error) {
//           // console.warn('Failed to disconnect WebSocket during sign out:', error);
        }
      }
      
      if (signOut && typeof signOut === 'function') {
        await signOut();
      } else {
        throw new Error('Firebase signOut function not available');
      }
      
      setCurrentChatId(null);
      setIsConversationActive(false);
      setShowConversationDropdown(false);
      setUserProfile(null);
      setIsInMatchmakingQueue(false);
      
      if (router && typeof router.push === 'function') {
        router.push('/firebase-signin');
      } else {
        window.location.href = '/firebase-signin';
      }
    } catch (error) {
      console.error('Failed to sign out:', error);
      setError(`Failed to sign out: ${error.message}`);
    } finally {
      setIsSigningOut(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/firebase-signin');
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated && user && !authLoading) {
      loadUserData();
    }
  }, [user, isAuthenticated, authLoading]);

  const getPartnerName = useCallback(async () => {
    try {
      if (!currentChatId || !conversationMetadata.participants || conversationMetadata.participants.length === 0) {
        return "Anonymous";
      }

      const currentUserId = user?.uid || null;
      if (!currentUserId) {
        return "Anonymous";
      }

      const participantsArray = Array.isArray(conversationMetadata.participants) 
        ? conversationMetadata.participants 
        : [];
      
      const partnerUserId = participantsArray.find(id => id !== currentUserId);
      
      if (!partnerUserId) {
        return "Anonymous";
      }

      const partnerProfile = await apiClient.getUserProfileById(partnerUserId);
      return partnerProfile.name || partnerProfile.displayName || "Anonymous";
    } catch (error) {
      console.error('Failed to get partner name:', error);
      return "Anonymous";
    }
  }, [currentChatId, conversationMetadata.participants, user?.uid]);

  // Update local state when WebSocket state changes
  useEffect(() => {
    setCurrentChatId(userMetadata.chatId);
    setIsConversationActive(hasActiveChat);
    setConnectionId(userMetadata.connectionId);
    
    if (userMetadata.ready && !userMetadata.chatId && !hasActiveChat) {
//       // console.log('HomeContent: Detected user in matchmaking queue from WebSocket state');
      setIsInMatchmakingQueue(true);
    } else if (userMetadata.chatId || hasActiveChat || !userMetadata.ready) {
//       // console.log('HomeContent: User not in matchmaking queue - ready:', userMetadata.ready, 'chatId:', userMetadata.chatId, 'hasActiveChat:', hasActiveChat);
      setIsInMatchmakingQueue(false);
    }
  }, [userMetadata.chatId, hasActiveChat, userMetadata.connectionId, userMetadata.ready]);

  // Update partner name when conversation metadata changes
  useEffect(() => {
    const updatePartnerName = async () => {
      try {
        const name = await getPartnerName();
        setPartnerName(name);
      } catch (error) {
        console.error('Failed to update partner name:', error);
        setPartnerName("Johnathan");
      }
    };

    if (currentChatId && conversationMetadata.participants && conversationMetadata.participants.length > 0) {
      updatePartnerName();
    } else {
      setPartnerName("Johnathan");
    }
  }, [currentChatId, conversationMetadata.participants, getPartnerName]);

  const loadUserData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const userId = user?.uid || null;
      if (!userId) {
        throw new Error('User ID not available');
      }

      const profile = await apiClient.getCurrentUserProfile();
      setUserProfile(profile);

      // Initialize user - the WebSocket connection will be established automatically
      // by the WebSocketProvider when it's ready
//       // console.log('Initializing user...');
      await initializeUser(userId);

      // Remove the hardcoded hasActiveChat call since initializeUser already fetches this data via WebSocket
      // The WebSocket getCurrentState provides the correct user metadata from DynamoDB
//       // console.log('User data loaded successfully:', { profile, userId });
    } catch (error) {
      console.error('Failed to load user data:', error);
      setError('Failed to load user data. Please try refreshing the page.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnterConversation = () => {
    if (currentChatId) {
      router.push(`/${encodeURIComponent(currentChatId)}`);
    }
  };

  const handleStartNewConversation = async () => {
    try {
//       // console.log('Starting new conversation...');
//       // console.log('Current state check - hasActiveChat:', hasActiveChat, 'userMetadata.chatId:', userMetadata.chatId, 'currentChatId:', currentChatId);
      
      // Check if user already has an active conversation
      if (hasActiveChat || userMetadata.chatId || currentChatId) {
//         // console.log('User already has an active conversation, preventing new start');
        setError('You already have an active conversation. Please end your current conversation before starting a new one.');
        return;
      }
      
      setIsInMatchmakingQueue(true);
      setError(null);
      
//       // console.log('Calling startNewChat...');
      const matchResult = await startNewChat();
//       // console.log('startNewChat result:', matchResult);
      
      if (matchResult.matched && matchResult.chatId) {
//         // console.log('Matched! Navigating to chat:', matchResult.chatId);
        router.push(`/${encodeURIComponent(matchResult.chatId)}`);
      } else if (matchResult.queued) {
//         // console.log('Added to matchmaking queue');
      } else {
        console.error('Unexpected matchResult:', matchResult);
        throw new Error('Failed to start matchmaking process');
      }
    } catch (error) {
      console.error('Failed to start matchmaking:', error);
      
      // Check if the error is about user already being in a conversation
      if (error.message && error.message.includes('already in a conversation')) {
        setError('You already have an active conversation. Please end your current conversation before starting a new one.');
      } else {
        setError('Failed to start new conversation. Please try again.');
      }
      setIsInMatchmakingQueue(false);
    }
  };

  const handleLeaveMatchmakingQueue = async () => {
    try {
//       // console.log('Leaving matchmaking queue...');
      setError(null);
      
      if (wsActions) {
        try {
          await wsActions.setReady({ ready: false });
        } catch (error) {
//           // console.warn('Failed to remove from matchmaking queue:', error);
        }
      }
      
      setIsInMatchmakingQueue(false);
      
//       // console.log('Successfully left matchmaking queue');
    } catch (error) {
      console.error('Failed to leave matchmaking queue:', error);
      setError('Failed to leave matchmaking queue. Please try again.');
    }
  };

  const handleToggleMatchmaking = async () => {
    if (isInMatchmakingQueue) {
      await handleLeaveMatchmakingQueue();
    } else {
      await handleStartNewConversation();
    }
  };

  const handleLeaveConversation = async () => {
    setShowEndDialog(true);
  };

  const confirmEndConversation = async () => {
    try {
      setError(null);
      
      if (!currentChatId) {
//         // console.warn('No active chat to leave');
        return;
      }

      await endChat(currentChatId, 'user_ended');
      
      setCurrentChatId(null);
      setIsConversationActive(false);
      setShowConversationDropdown(false);
      
//       // console.log('Successfully left conversation');
    } catch (error) {
      console.error('Failed to leave conversation:', error);
      setError('Failed to leave conversation. Please try again.');
    } finally {
      setShowEndDialog(false);
    }
  };

  const handleStartNewFromActive = async () => {
    try {
      setError(null);
      await handleLeaveConversation();
      setTimeout(() => {
        handleStartNewConversation();
      }, 500);
    } catch (error) {
      console.error('Failed to start new conversation:', error);
      setError('Failed to start new conversation. Please try again.');
    }
  };

  const getCurrentStatus = () => {
//     // console.log('getCurrentStatus - loading:', loading, 'initState.isInitializing:', initState.isInitializing, 'wsConnected:', wsConnected, 'isInMatchmakingQueue:', isInMatchmakingQueue, 'isConversationActive:', isConversationActive);
//     // console.log('getCurrentStatus - userMetadata.chatId:', userMetadata.chatId, 'hasActiveChat:', hasActiveChat, 'currentChatId:', currentChatId);
    
    // If WebSocket is connected but we don't have user metadata, try to get it
    if (wsConnected && !userMetadata.chatId && !hasActiveChat && !loading && !initState.isInitializing && user?.uid) {
//       // console.log('getCurrentStatus: WebSocket connected but no user metadata, triggering getCurrentState...');
      // Trigger getCurrentState as a fallback
      setTimeout(() => {
        if (wsActions && user?.uid) {
          wsActions.getCurrentState({ userId: user.uid }).catch(err => {
            console.error('getCurrentStatus: Failed to trigger getCurrentState fallback:', err);
          });
        }
      }, 1000);
    }
    
    if (loading || initState.isInitializing) {
      return "LOADING YOUR DATA...";
    }
    if (!wsConnected) {
      return "CONNECTING TO CHAT SERVICE...";
    }
    if (isInMatchmakingQueue) {
      return "LOOKING FOR YOUR NEXT PARTNER…";
    }
    // Use hasActiveChat from WebSocket context instead of local isConversationActive to avoid sync issues
    if (!hasActiveChat && !userMetadata.chatId && !currentChatId) {
      return "You're not in a conversation yet. Start a new conversation to find your next partner.";
    }
  };

  const getQuestionProgress = () => {
    const currentQuestion = userMetadata.questionIndex || 0;
    const totalQuestions = 36;
    return { current: currentQuestion, total: totalQuestions };
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-beige">
        <div className="text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal mx-auto mb-4"></div>
          <p className="text-teal font-jetbrains-mono">LOADING...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const questionProgress = getQuestionProgress();

  return (
    <div className="min-h-screen relative font-jetbrains-mono">
      {/* HOME_BG image */}
      <Image
        src={HOME_BG}
        alt="Home background"
        fill
        className="object-cover"
        priority
      />
      
      {/* Content */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* NavBar */}
        <nav>
          <div className="max-w-7xl mx-auto sm:px-6 lg:px-4 mt-20">
            <div className="flex justify-between items-center h-16">
              {/* App Logo */}
              <div className="flex-shrink-0">
                <button
                  onClick={() => router.push('/home')}
                  className="text-2xl font-semibold text-beige font-mono"
                >
                  MTJS
                </button>
              </div>

              {/* Hamburger Menu */}
              <div className="flex items-center space-x-4">
                <div className="relative group">
                  <button
                    className="p-3 rounded-md text-teal hover:bg-light-blue transition-colors"
                  >
                    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>

                  {/* Sign Out Button */}
                  <div className="absolute top-full right-0 mt-2 w-40 py-1 bg-transparent rounded-md opacity-0 group-hover:opacity-100 transition-opacity z-50">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSignOut();
                      }}
                      disabled={isSigningOut}
                      className={`block w-full text-right pr-2 py-2 text-lg text-teal font-medium hover:font-bold hover:text-sky-blue ${
                        isSigningOut ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {isSigningOut ? 'SIGNING OUT...' : 'SIGN OUT'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-md mx-auto">
            {/* Error Display */}
            {error && (
              <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-md">
                {error}
                <button 
                  onClick={() => setError(null)}
                  className="ml-2 text-red-800 hover:text-red-600"
                >
                  ×
                </button>
              </div>
            )}

            {/* Greeting and Progress */}
            <div className="mb-8 text-left text-teal text-2xl">
              <div className="mb-2">
                Hi, {userProfile?.name || 'there.'}
              </div>
              <div>
                You're currently on question
              </div>
              <div className='font-semibold'>
                {questionProgress.current}/{questionProgress.total} with {partnerName}.
              </div>
            </div>

            {/* Loading indicator for matchmaking */}
            {(isInMatchmakingQueue || initState.isInitializing) && (
                <div className="flex justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal"></div>
                </div>
              )}

            {/* Current Status */}
            <div className="mb-6 mt-4 text-center text-teal text-lg">
              {getCurrentStatus()}
            </div>

            {/* Action Buttons */}
            <div className="space-y-4">
              {/* New Messages Button Container */}
              <div className="relative group">
                {/* New Messages Button */}
                <button
                  onClick={handleEnterConversation}
                  disabled={!currentChatId || isInMatchmakingQueue || !wsConnected}
                  className={`w-full py-3 px-6 rounded-lg font-semibold bg-teal text-beige border-[3px] border-beige hover:bg-beige hover:text-teal hover:font-bold hover:border-teal transition-colors ${
                    currentChatId && !isInMatchmakingQueue && wsConnected
                      ? 'cursor-pointer'
                      : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  {currentChatId ? 'YOU HAVE 5* NEW MESSAGES →' : 'NO NEW MESSAGES'}
                </button>

                {/* End Conversation Button - use WebSocket state to determine if conversation is active */}
                {(hasActiveChat || userMetadata.chatId || currentChatId) && wsConnected && (
                  <button
                    onClick={handleLeaveConversation}
                    className="absolute top-full left-0 right-0 mt-2 w-full py-3 px-6 rounded-lg font-semibold text-beige bg-teal hover:bg-beige hover:text-teal hover:font-semibold hover:border-beige transition-colors opacity-0 group-hover:opacity-80"
                  >
                    END CONVERSATION
                  </button>
                )}
              </div>

              {/* Start New Conversation Button - only show if user doesn't have active chat */}
              {!hasActiveChat && !userMetadata.chatId && !currentChatId && (
                <button
                  onClick={handleToggleMatchmaking}
                  disabled={initState.isInitializing}
                  className={`w-full py-3 px-6 rounded-lg font-semibold text-blue-800 transition-colors ${
                    !initState.isInitializing
                      ? 'bg-blue-200 hover:bg-blue-300 cursor-pointer'
                      : 'bg-gray-200 opacity-50 cursor-not-allowed'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
                >
                  {isInMatchmakingQueue ? 'LEAVE MATCHMAKING QUEUE' : 'START NEW CONVERSATION'}
                </button>
              )}

              
            </div>
          </div>
        </main>

        {/* Click outside handlers */}
        {showConversationDropdown && (
          <div
            className="fixed inset-0 z-30"
            onClick={() => {
              setShowConversationDropdown(false);
            }}
          />
        )}

        {/* Custom End Conversation Dialog */}
        {showEndDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-beige border-2 border-teal rounded-lg p-6 max-w-md mx-4">
              <div className="text-center">
                <h3 className="text-teal font-bold text-lg mb-4 uppercase">
                  End Conversation?
                </h3>
                <p className="text-teal mb-6 text-sm uppercase">
                  Are you sure you want to end the conversation? This action cannot be undone.
                </p>
                <div className="flex space-x-4 justify-center">
                  <button
                    onClick={() => setShowEndDialog(false)}
                    className="px-4 py-2 border border-teal text-teal rounded hover:bg-teal hover:text-beige transition-colors uppercase"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmEndConversation}
                    className="px-4 py-2 bg-teal text-beige rounded hover:bg-opacity-80 transition-colors uppercase"
                  >
                    End Conversation
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  
  // Key State
  const [currentChatId, setCurrentChatId] = useState(null);
  const [isInMatchmakingQueue, setIsInMatchmakingQueue] = useState(false);
  const [isConversationActive, setIsConversationActive] = useState(false);
  const [user, setUser] = useState(null);
  const [connectionId, setConnectionId] = useState(null);
  const [showConversationDropdown, setShowConversationDropdown] = useState(false);
  const [showHamburgerMenu, setShowHamburgerMenu] = useState(false);

  // Load user data and check for existing conversation on mount
  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      // TODO: Load user data from auth/API
      // const userData = await getUserData();
      // setUser(userData);
      // setCurrentChatId(userData.currentChatId);
      // setIsConversationActive(!!userData.currentChatId);
      
      // Mock data for development
      setUser({ name: 'User', avatar: '/avatar.png' });
    } catch (error) {
      console.error('Failed to load user data:', error);
    }
  };

  const handleEnterConversation = () => {
    if (currentChatId) {
      router.push(`/chatroom/${currentChatId}`);
    }
  };

  const handleStartNewConversation = async () => {
    try {
      setIsInMatchmakingQueue(true);
      // TODO: Implement matchmaking logic
      // const matchResult = await enterMatchmakingQueue();
      // if (matchResult.chatId) {
      //   router.push(`/chatroom/${matchResult.chatId}`);
      // }
    } catch (error) {
      console.error('Failed to start matchmaking:', error);
      setIsInMatchmakingQueue(false);
    }
  };

  const handleLeaveConversation = async () => {
    try {
      // TODO: End current chat via API
      // await endConversation(currentChatId);
      setCurrentChatId(null);
      setIsConversationActive(false);
      setShowConversationDropdown(false);
    } catch (error) {
      console.error('Failed to leave conversation:', error);
    }
  };

  const handleStartNewFromActive = async () => {
    try {
      await handleLeaveConversation();
      await handleStartNewConversation();
    } catch (error) {
      console.error('Failed to start new conversation:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      // TODO: Clear local state, token, and redirect
      // await signOut();
      // clearLocalStorage();
      router.push('/signin');
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  };

  const getCurrentStatus = () => {
    if (isInMatchmakingQueue) {
      return "Looking for your next partner…";
    }
    if (isConversationActive) {
      return "You're currently in a conversation";
    }
    return "You're not in a conversation yet";
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* NavBar */}
      <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* App Logo */}
            <div className="flex-shrink-0">
              <button
                onClick={() => router.push('/')}
                className="text-xl font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                More Than Just Strangers
              </button>
            </div>

            {/* Hamburger Menu */}
            <div className="relative">
              <button
                onClick={() => setShowHamburgerMenu(!showHamburgerMenu)}
                className="p-2 rounded-md text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* Hamburger Dropdown */}
              {showHamburgerMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 z-10 border border-gray-200 dark:border-gray-700">
                  <button
                    onClick={handleSignOut}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Landing Body */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-8">
            More Than Just Strangers
          </h1>

          {/* Current Status */}
          <div className="mb-8">
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
              {getCurrentStatus()}
            </p>
            
            {isInMatchmakingQueue && (
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-4 max-w-md mx-auto">
            {/* Enter Conversation Button */}
            <button
              onClick={handleEnterConversation}
              disabled={!currentChatId || isInMatchmakingQueue}
              className={`w-full py-3 px-6 rounded-lg font-semibold text-white transition-colors ${
                currentChatId && !isInMatchmakingQueue
                  ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
                  : 'bg-gray-400 cursor-not-allowed'
              } focus:outline-none focus:ring-2 focus:ring-offset-2`}
            >
              {currentChatId ? 'Enter Current Conversation' : 'No Active Conversation'}
            </button>

            {/* Start New Conversation Button */}
            <button
              onClick={handleStartNewConversation}
              disabled={isInMatchmakingQueue}
              className={`w-full py-3 px-6 rounded-lg font-semibold text-white transition-colors ${
                !isInMatchmakingQueue
                  ? 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
                  : 'bg-gray-400 cursor-not-allowed'
              } focus:outline-none focus:ring-2 focus:ring-offset-2`}
            >
              {isInMatchmakingQueue ? 'Finding Partner...' : 'Start New Conversation'}
            </button>

            {/* Conversation Controls Dropdown */}
            {isConversationActive && (
              <div className="relative">
                <button
                  onClick={() => setShowConversationDropdown(!showConversationDropdown)}
                  className="w-full py-3 px-6 rounded-lg font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Conversation Options
                </button>

                {showConversationDropdown && (
                  <div className="absolute w-full mt-2 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 z-10 border border-gray-200 dark:border-gray-700">
                    <button
                      onClick={handleLeaveConversation}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      Leave Conversation
                    </button>
                    <button
                      onClick={handleStartNewFromActive}
                      className="block w-full text-left px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      Start New Conversation
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Click outside handlers */}
      {(showHamburgerMenu || showConversationDropdown) && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => {
            setShowHamburgerMenu(false);
            setShowConversationDropdown(false);
          }}
        />
      )}
    </div>
  );
}

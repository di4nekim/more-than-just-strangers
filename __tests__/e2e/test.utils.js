import React from 'react';
import { render } from '@testing-library/react';
import { RouterContext } from 'next/dist/shared/lib/router-context';
import { ChatProvider } from '@/contexts/ChatContext';
import { ConversationProvider } from '@/contexts/ConversationContext';

// Custom render function with all providers
export function renderWithProviders(
  ui,
  {
    router = {},
    chatContext = {},
    conversationContext = {},
    ...renderOptions
  } = {}
) {
  const mockRouter = {
    pathname: '/',
    route: '/',
    query: {},
    asPath: '/',
    push: jest.fn(),
    replace: jest.fn(),
    reload: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
    beforePopState: jest.fn(),
    events: {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    },
    ...router,
  };

  function Wrapper({ children }) {
    return (
      <RouterContext.Provider value={mockRouter}>
        <ConversationProvider initialState={conversationContext}>
          <ChatProvider initialState={chatContext}>
            {children}
          </ChatProvider>
        </ConversationProvider>
      </RouterContext.Provider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    mockRouter,
  };
}

// Re-export everything
export * from '@testing-library/react';
import type { ReactNode } from 'react';
import { BrowserRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './queryClient';
import { FeedbackProvider } from '../shared/ui/feedback/FeedbackProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <FeedbackProvider>
          {children}
        </FeedbackProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

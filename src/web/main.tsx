import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import './styles/app.css';
import { router } from './routes';
import { ApiError, reportClientError } from './lib/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (n, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && n < 2,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
  },
});

// After a deploy, a tab from the previous version can no longer load its page files: reload once to get the new ones.
window.addEventListener('vite:preloadError', (e) => {
  try {
    if (Date.now() - Number(sessionStorage.getItem('nk_reloaded') ?? 0) < 30_000) return;
    sessionStorage.setItem('nk_reloaded', String(Date.now()));
    e.preventDefault();
    location.reload();
  } catch { /* storage unavailable: the error page offers a reload */ }
});

window.addEventListener('error', (e) => reportClientError('window_error', String(e.message)));
window.addEventListener('unhandledrejection', (e) => {
  if (!(e.reason instanceof ApiError)) reportClientError('unhandled_rejection', String(e.reason?.message ?? e.reason));
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

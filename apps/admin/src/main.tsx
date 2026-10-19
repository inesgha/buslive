import './styles.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';

// Données de modération : toujours fraîches (pas de cache long, pas de hors ligne).
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
});

const root = document.getElementById('root');
if (!root) throw new Error('Élément #root introuvable.');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Chemin de base (« /admin » en production), donné par Vite. */}
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import {ToastProvider} from './features/ui/ToastProvider.tsx';
import { router } from './router.tsx';
import './index.css';
import 'katex/dist/katex.min.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  </StrictMode>,
);

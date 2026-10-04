import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx';
import { reportRenderError, startErrorReporter } from './utils/errorReporter.ts';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import './index.css';

// Errors on customers' screens go to the owner's log («Аналитика» → «Ошибки на сайте», docs/ops-plan.md)
startErrorReporter();

createRoot(document.getElementById('root')!, {
  // A screen that failed to draw: the boundary shows «Обновить страницу», the owner gets the error
  onCaughtError: (error, info) => {
    console.warn('A screen failed to draw:', error);
    reportRenderError(error, info.componentStack);
  },
  onUncaughtError: (error, info) => {
    console.warn('The app failed to draw:', error);
    reportRenderError(error, info.componentStack);
  },
}).render(
  <StrictMode>
    <AppErrorBoundary>
      {/* «Reduce motion» in the system: framer animations keep fades but drop movement and scaling */}
      <MotionConfig reducedMotion="user">
        <AuthProvider>
          <App />
        </AuthProvider>
      </MotionConfig>
    </AppErrorBoundary>
  </StrictMode>
);

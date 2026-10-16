import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion, MotionConfig } from 'motion/react';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx';
import { reportRenderError, startErrorReporter } from './utils/errorReporter.ts';
import { whenReadsSettle } from './utils/pendingReads.ts';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import './index.css';

// Stage 5 of docs/performance-plan.md: animation features load in a separate chunk after the first screen's photos settle
const loadMotionFeatures = () => whenReadsSettle().then(() => import('./utils/motionFeatures.ts').then((r) => r.default));

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
      <LazyMotion features={loadMotionFeatures} strict>
        <MotionConfig reducedMotion="user">
          <AuthProvider>
            <App />
          </AuthProvider>
        </MotionConfig>
      </LazyMotion>
    </AppErrorBoundary>
  </StrictMode>
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* «Reduce motion» in the system: framer animations keep fades but drop movement and scaling */}
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <App />
      </AuthProvider>
    </MotionConfig>
  </StrictMode>
);


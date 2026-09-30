import React, { Suspense, useState } from 'react';

/**
 * A window loaded on demand: nothing is rendered (and its code is not needed) until it is opened for the first
 * time; after that it stays mounted so its closing animation and state work as before.
 */
export const LazyMount: React.FC<{ when: boolean; children: React.ReactNode }> = ({ when, children }) => {
  const [opened, setOpened] = useState(when);
  if (when && !opened) setOpened(true);
  if (!opened) return null;
  return <Suspense fallback={null}>{children}</Suspense>;
};

import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders a full-screen modal into <body>. `.neu-modal` has `transform` and `contain: paint`,
 * so a `position: fixed` overlay nested inside the admin panel (or the product form) would be
 * sized and clipped by that box instead of covering the screen.
 */
export const ModalPortal: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  typeof document === 'undefined' ? <>{children}</> : createPortal(children, document.body);

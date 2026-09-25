import React from 'react';

interface IconProps {
  className?: string;
}

// Collared buttoned shirt (Рубашки)
export const ShirtIcon: React.FC<IconProps> = ({ className = 'w-6 h-6' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M20.38 3.46 16 2a4 4 0 0 0-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
    <path d="M8 2a4 4 0 0 0 8 0" />
    <path d="M12 6v14" />
    <circle cx="12" cy="9.5" r="0.6" fill="currentColor" />
    <circle cx="12" cy="13" r="0.6" fill="currentColor" />
    <circle cx="12" cy="16.5" r="0.6" fill="currentColor" />
  </svg>
);

// Crewneck T-Shirt (Футболки)
export const TShirtIcon: React.FC<IconProps> = ({ className = 'w-6 h-6' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M6 4h12l3.5 5-3.5 2v9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-9L2.5 9 6 4z" />
    <path d="M9 4a3 3 0 0 0 6 0" />
  </svg>
);

// Zippered Jacket / Coat (Куртки)
export const JacketIcon: React.FC<IconProps> = ({ className = 'w-6 h-6' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M4 4h16l2 6-3 1v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V11L2 10l2-6z" />
    <path d="M12 4v17" />
    <path d="M8 4l4 4 4-4" />
    <path d="M8 13h3" />
    <path d="M13 17h3" />
  </svg>
);

// Trousers / Pants (Брюки)
export const PantsIcon: React.FC<IconProps> = ({ className = 'w-6 h-6' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M5 4h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-8l-2-1-2 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
    <path d="M4 8h16" />
    <path d="M12 4v4" />
  </svg>
);

// Sweatshirt / Pullover (Свитшоты)
export const SweatshirtIcon: React.FC<IconProps> = ({ className = 'w-6 h-6' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M7 4h10l4 5-2 12H5L3 9l4-5z" />
    <path d="M9 4c0 1.5 1.3 3 3 3s3-1.5 3-3" />
    <path d="M5 21h14" />
    <path d="M3 9h4" />
    <path d="M17 9h4" />
  </svg>
);

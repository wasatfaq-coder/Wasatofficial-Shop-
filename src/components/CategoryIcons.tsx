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

/** Same outline style as the icons above */
const Outline: React.FC<IconProps & { children: React.ReactNode }> = ({ className = 'w-6 h-6', children }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {children}
  </svg>
);

// Hoodie (Худи)
export const HoodieIcon: React.FC<IconProps> = ({ className }) => (
  <Outline className={className}>
    <path d="M8.5 5 4 7.5 2.5 14l3 .8V21h13v-6.2l3-.8L20 7.5 15.5 5" />
    <path d="M8.5 5.5C8.5 3.3 10 2 12 2s3.5 1.3 3.5 3.5S14 9 12 9 8.5 7.7 8.5 5.5z" />
    <path d="M11 9v3M13 9v3" />
    <path d="M8.5 17h7" />
  </Outline>
);

// Polo shirt (Поло)
export const PoloIcon: React.FC<IconProps> = ({ className }) => (
  <Outline className={className}>
    <path d="M6 4h12l3.5 5-3.5 2v9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-9L2.5 9 6 4z" />
    <path d="M9 4l3 3 3-3" />
    <path d="M12 7v4" />
    <circle cx="12" cy="9" r="0.6" fill="currentColor" />
  </Outline>
);

// Knitted sweater (Свитеры и трикотаж)
export const SweaterIcon: React.FC<IconProps> = ({ className }) => (
  <Outline className={className}>
    <path d="M7 4h10l4.5 5-2.5 1.5V21H5V10.5L2.5 9 7 4z" />
    <path d="M9.5 4a2.5 2.5 0 0 0 5 0" />
    <path d="M8.5 11l1.75 1.5L12 11l1.75 1.5L15.5 11" />
    <path d="M8.5 14.5l1.75 1.5L12 14.5l1.75 1.5L15.5 14.5" />
    <path d="M5 18.5h14" />
  </Outline>
);

// Blazer / suit jacket (Пиджаки и костюмы)
export const BlazerIcon: React.FC<IconProps> = ({ className }) => (
  <Outline className={className}>
    <path d="M7.5 3h9l4 3.5L19.5 21h-15L3.5 6.5 7.5 3z" />
    <path d="M7.5 3 12 12l4.5-9" />
    <path d="M12 12v9" />
    <circle cx="12" cy="15.5" r="0.6" fill="currentColor" />
    <path d="M15 14.5h2.5" />
  </Outline>
);

// Long coat (Пальто)
export const CoatIcon: React.FC<IconProps> = ({ className }) => (
  <Outline className={className}>
    <path d="M7.5 2h9l4 4L19 22H5L3.5 6l4-4z" />
    <path d="M7.5 2 12 8l4.5-6" />
    <path d="M12 8v14" />
    <path d="M4.6 13.5h14.8" />
    <circle cx="10" cy="11" r="0.6" fill="currentColor" />
    <circle cx="10" cy="16.5" r="0.6" fill="currentColor" />
  </Outline>
);

// Vest (Жилеты)
export const VestIcon: React.FC<IconProps> = ({ className }) => (
  <Outline className={className}>
    <path d="M8 3 6 5.5v2L4.5 10v11H11l1-2 1 2h6.5V10L18 7.5v-2L16 3" />
    <path d="M8 3l4 8 4-8" />
    <circle cx="12" cy="14" r="0.6" fill="currentColor" />
    <circle cx="12" cy="17" r="0.6" fill="currentColor" />
  </Outline>
);

// Shorts (Шорты)
export const ShortsIcon: React.FC<IconProps> = ({ className }) => (
  <Outline className={className}>
    <path d="M4.5 5h15l1.5 12.5h-7.5L12 11l-1.5 6.5H3L4.5 5z" />
    <path d="M4.2 8h15.6" />
    <path d="M12 5v3" />
  </Outline>
);

// Underwear (Белье)
export const UnderwearIcon: React.FC<IconProps> = ({ className }) => (
  <Outline className={className}>
    <path d="M3.5 6h17v3.5L19 19h-5.5L12 13.5 10.5 19H5L3.5 9.5V6z" />
    <path d="M3.5 9h17" />
  </Outline>
);

// Cap (Головные уборы)
export const CapIcon: React.FC<IconProps> = ({ className }) => (
  <Outline className={className}>
    <path d="M3 16a8 8 0 0 1 16 0v1H3v-1z" />
    <path d="M19 17h2.5" />
    <path d="M11 8v9" />
    <circle cx="11" cy="7" r="0.6" fill="currentColor" />
  </Outline>
);

// Socks (Носки)
export const SocksIcon: React.FC<IconProps> = ({ className }) => (
  <Outline className={className}>
    <path d="M8 3h7v9l3.8 4.2a2.8 2.8 0 0 1-4 4L9.2 15.4A4 4 0 0 1 8 12.6V3z" />
    <path d="M8 6.5h7" />
    <path d="M13.5 17.8l2.2-2.2" />
  </Outline>
);

// Tie (Галстуки)
export const TieIcon: React.FC<IconProps> = ({ className }) => (
  <Outline className={className}>
    <path d="M10 3h4l-1 3h-2l-1-3z" />
    <path d="M11 6 8.5 16.5 12 21l3.5-4.5L13 6" />
  </Outline>
);

// Belt (Ремни)
export const BeltIcon: React.FC<IconProps> = ({ className }) => (
  <Outline className={className}>
    <path d="M2 9h11M18 9h4v6h-4M13 15H2V9" />
    <rect x="13" y="7" width="5" height="10" rx="1" />
    <path d="M13 12h3" />
  </Outline>
);

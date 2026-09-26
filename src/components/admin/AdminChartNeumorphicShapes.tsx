import React from 'react';
import { DailyDataPoint } from '../../utils/analyticsEngine';

/**
 * Triggers light tactile haptic vibration on mobile devices supporting the Vibration API.
 */
export const triggerChartHapticFeedback = (intensity: 'light' | 'medium' | 'double' = 'light') => {
  if (typeof window !== 'undefined' && 'navigator' in window && typeof navigator.vibrate === 'function') {
    try {
      if (intensity === 'double') {
        navigator.vibrate([10, 30, 15]);
      } else if (intensity === 'medium') {
        navigator.vibrate(18);
      } else {
        navigator.vibrate(10);
      }
    } catch {
      // Ignore vibration errors if restricted by device policy
    }
  }
};

/**
 * SVG Filters and Gradients definition block for authentic Neumorphic dual-light physics.
 */
export const NeumorphicSVGDefs: React.FC = () => {
  return (
    <defs>
      {/* Raised bar: the same dual light as --neu-raised-sm in index.css (dark rgb(163 177 198 / .65) to the
          bottom-right, white rgb(255 255 255 / .95) to the top-left) */}
      <filter id="neu-bar-elevation" x="-40%" y="-20%" width="180%" height="140%">
        <feDropShadow dx="3" dy="3" stdDeviation="3.5" floodColor="rgb(163, 177, 198)" floodOpacity="0.65" />
        <feDropShadow dx="-3" dy="-3" stdDeviation="3.5" floodColor="#FFFFFF" floodOpacity="0.95" />
      </filter>

      {/* 4. Inset Vertical Track Gradient (Recessed slot effect) */}
      <linearGradient id="neu-track-recess" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#CCD6E4" stopOpacity="0.6" />
        <stop offset="35%" stopColor="#E3E8EF" stopOpacity="0.2" />
        <stop offset="65%" stopColor="#E3E8EF" stopOpacity="0.2" />
        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.7" />
      </linearGradient>

      {/* 5. Convex Bar Body Gradients */}
      <linearGradient id="neu-bar-indigo-convex" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#4A6A8E" />
        <stop offset="45%" stopColor="#2C4A6B" />
        <stop offset="100%" stopColor="#1F3650" />
      </linearGradient>

      <linearGradient id="neu-bar-emerald-convex" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#5E8A74" />
        <stop offset="45%" stopColor="#3B6652" />
        <stop offset="100%" stopColor="#2B4E3E" />
      </linearGradient>

      <linearGradient id="neu-bar-sky-convex" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#8196B3" />
        <stop offset="45%" stopColor="#5A6F8C" />
        <stop offset="100%" stopColor="#44576F" />
      </linearGradient>

      <linearGradient id="neu-bar-amber-convex" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#A68B55" />
        <stop offset="45%" stopColor="#8C733E" />
        <stop offset="100%" stopColor="#584826" />
      </linearGradient>


      <linearGradient id="neu-bar-prev-convex" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#E2E8F0" />
        <stop offset="50%" stopColor="#CBD5E1" />
        <stop offset="100%" stopColor="#94A3B8" />
      </linearGradient>

      {/* 6. Soft Translucent Gradients for Area & Composed Mix fills */}
      <linearGradient id="colorRevenueArea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#2C4A6B" stopOpacity={0.28} />
        <stop offset="100%" stopColor="#2C4A6B" stopOpacity={0} />
      </linearGradient>
      <linearGradient id="colorOrdersArea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3B6652" stopOpacity={0.28} />
        <stop offset="100%" stopColor="#3B6652" stopOpacity={0} />
      </linearGradient>
      <linearGradient id="colorAvgCheckArea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#5A6F8C" stopOpacity={0.28} />
        <stop offset="100%" stopColor="#5A6F8C" stopOpacity={0} />
      </linearGradient>
      <linearGradient id="colorReturnsArea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#8C733E" stopOpacity={0.28} />
        <stop offset="100%" stopColor="#8C733E" stopOpacity={0} />
      </linearGradient>
      <linearGradient id="colorPrevArea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#94A3B8" stopOpacity={0.35} />
        <stop offset="100%" stopColor="#E3E8EF" stopOpacity={0.0} />
      </linearGradient>
    </defs>
  );
};

interface NeumorphicBarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: DailyDataPoint;
  selectedDate?: string | null;
  activeMetric?: string;
  isPrevious?: boolean;
}

/**
 * Custom Neumorphic Bar Shape:
 * Renders an extruded 3D physical tactile bar with recessed track,
 * rounded capsule top, bevel highlight stroke, and interactive elevation.
 */
export const NeumorphicBarShape: React.FC<NeumorphicBarShapeProps> = (props) => {
  const {
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    payload,
    selectedDate,
    activeMetric = 'revenue',
    isPrevious = false,
  } = props;

  // Don't render zero or negative height
  if (height <= 0 || width <= 0) return null;

  const isSelected = selectedDate && payload?.date === selectedDate;
  const isPeak = payload?.isPeakDay && activeMetric === 'revenue';

  const radius = Math.min(width / 2, 7);
  const trackHeight = Math.max(height + y, 220);

  // Gradient fill selection
  let barGradient = 'url(#neu-bar-indigo-convex)';
  if (isPrevious) {
    barGradient = 'url(#neu-bar-prev-convex)';
  } else if (activeMetric === 'orders') {
    barGradient = 'url(#neu-bar-emerald-convex)';
  } else if (activeMetric === 'avgCheck') {
    barGradient = 'url(#neu-bar-sky-convex)';
  } else if (activeMetric === 'returns') {
    barGradient = 'url(#neu-bar-amber-convex)';
  }

  return (
    <g className="transition-all duration-200 cursor-pointer">
      {/* 1. Inset Background Track Groove (The recessed slot where the bar ascends) */}
      {!isPrevious && (
        <rect
          x={x}
          y={10}
          width={width}
          height={trackHeight}
          rx={radius}
          ry={radius}
          fill="url(#neu-track-recess)"
          opacity={0.45}
        />
      )}

      {/* 2. Selected Active Pulsing Background Halo */}
      {isSelected && (
        <rect
          x={x - 3}
          y={y - 3}
          width={width + 6}
          height={height + 6}
          rx={radius + 2}
          ry={radius + 2}
          fill="none"
          stroke="#2C4A6B"
          strokeWidth={2}
          strokeDasharray="4 3"
          opacity={0.85}
        />
      )}

      {/* 3. Main Convex Neumorphic Bar Body */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={radius}
        ry={radius}
        fill={barGradient}
        filter="url(#neu-bar-elevation)"
        stroke={isSelected ? '#FFFFFF' : 'rgba(255, 255, 255, 0.45)'}
        strokeWidth={isSelected ? 1.8 : 0.8}
        className="transition-transform duration-150 active:scale-95"
      />

      {/* 4. Top Cap Tactile Bevel Highlight (Simulates physical light hitting the upper curved surface) */}
      <path
        d={`M ${x + 2} ${y + radius} Q ${x + width / 2} ${y + 1} ${x + width - 2} ${y + radius}`}
        stroke="#FFFFFF"
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
        opacity={0.8}
      />

      {/* 5. Peak Day Tactile Crown Indicator */}
      {isPeak && !isPrevious && height > 30 && (
        <circle
          cx={x + width / 2}
          cy={y + radius + 3}
          r={2.5}
          fill="#FFFFFF"
          stroke="#2C4A6B"
          strokeWidth={1}
        />
      )}
    </g>
  );
};

interface NeumorphicActiveDotProps {
  cx?: number;
  cy?: number;
  stroke?: string;
  activeMetric?: string;
}

/**
 * Custom Neumorphic Active Dot:
 * Floating 3D spherical jewel with authentic tactile elevation and optical reflection.
 */
export const NeumorphicActiveDot: React.FC<NeumorphicActiveDotProps> = (props) => {
  const { cx = 0, cy = 0, stroke = '#2C4A6B' } = props;
  // A calm marker: no endless pulsing (it repainted the chart every frame)
  return (
    <g pointerEvents="none">
      <circle cx={cx} cy={cy} r={8} fill={stroke} fillOpacity={0.14} />
      <circle cx={cx} cy={cy} r={5} fill="#FFFFFF" stroke={stroke} strokeWidth={2.5} />
    </g>
  );
};

interface NeumorphicCursorProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Given by Recharts for line/area charts */
  points?: { x: number; y: number }[];
}

/**
 * Custom Neumorphic Cursor:
 * Recessed vertical slot groove providing tactile visual confirmation upon hover.
 */
export const NeumorphicCursor: React.FC<NeumorphicCursorProps> = (props) => {
  const { x = 0, y = 0, width = 30, height = 220, points } = props;
  // Line chart: a thin guide line at the hovered day
  if (points && points.length >= 2) {
    return (
      <line
        x1={points[0].x}
        y1={points[0].y}
        x2={points[1].x}
        y2={points[1].y}
        stroke="#2C4A6B"
        strokeOpacity={0.35}
        strokeWidth={1.5}
        strokeDasharray="3 4"
        pointerEvents="none"
      />
    );
  }
  // Bar chart: a soft band behind the hovered bar
  return <rect x={x} y={y} width={width} height={height} rx={10} ry={10} fill="#2C4A6B" fillOpacity={0.06} pointerEvents="none" />;
};

interface NeumorphicAxisTickProps {
  x?: number;
  y?: number;
  stroke?: string;
  payload?: {
    value: string;
    coordinate?: number;
    index?: number;
  };
  index?: number;
  selectedDate?: string | null;
  period?: string;
  dailyData?: DailyDataPoint[];
}

/**
 * Custom Neumorphic XAxis Tick:
 * Solves label collisions by neatly splitting the date into a stacked, two-line
 * compact presentation: large crisp day number + subtle uppercase weekday/month.
 * Also highlights the selected or peak day with a soft neumorphic pill.
 */
export const NeumorphicAxisTick: React.FC<NeumorphicAxisTickProps> = (props) => {
  const { x = 0, y = 0, payload, index, selectedDate, period = '7d', dailyData = [] } = props;
  const rawValue = String(payload?.value || '');

  // Retrieve associated day point from data array
  const tickIndex = payload?.index !== undefined ? payload.index : index;
  const dayPoint = tickIndex !== undefined && dailyData && dailyData[tickIndex] ? dailyData[tickIndex] : null;

  const isSelected = Boolean(
    (selectedDate && dayPoint?.date === selectedDate) ||
    (selectedDate && rawValue.includes(selectedDate))
  );

  const isPeak = Boolean(dayPoint?.isPeakDay);

  let primaryText = rawValue;
  let secondaryText = '';

  const spaceParts = rawValue.trim().split(/\s+/);
  if (spaceParts.length >= 2) {
    // Standard format: "Ср 16"
    if (isNaN(Number(spaceParts[0])) && !isNaN(Number(spaceParts[1]))) {
      primaryText = spaceParts[1];               // "16"
      secondaryText = spaceParts[0].toLowerCase(); // "ср"
    } else if (!isNaN(Number(spaceParts[0]))) {
      primaryText = spaceParts[0];               // "16"
      secondaryText = spaceParts[1];             // "сен"
    }
  } else if (dayPoint) {
    if (period === '6m' || period === '1y') {
      primaryText = dayPoint.label;
      secondaryText = '';
    } else {
      primaryText = dayPoint.date.split(' ')[0] || rawValue;
      secondaryText = dayPoint.weekday?.toLowerCase() || '';
    }
  }

  const textColor = isSelected ? '#2C4A6B' : '#2D3A4E';
  const subTextColor = isSelected ? '#2C4A6B' : '#4E5C70';
  const pillWidth = Math.max(26, primaryText.length * 8 + 12);
  const pillHeight = secondaryText ? 27 : 19;

  return (
    <g transform={`translate(${x},${y})`} className="cursor-pointer select-none">
      {/* Neumorphic Inset Pill Highlight for Selected Day */}
      {isSelected && (
        <rect
          x={-pillWidth / 2}
          y={2}
          width={pillWidth}
          height={pillHeight}
          rx={7}
          ry={7}
          fill="#2C4A6B"
          fillOpacity={0.14}
          stroke="#2C4A6B"
          strokeWidth={1.2}
        />
      )}

      {/* Peak Day Subtle Amber Accent Marker */}
      {isPeak && !isSelected && (
        <circle
          cx={0}
          cy={secondaryText ? 24 : 16}
          r={1.8}
          fill="#8C733E"
          className="animate-pulse"
        />
      )}

      {/* Primary Text (Day number or month) */}
      <text
        x={0}
        y={secondaryText ? 12 : 12}
        textAnchor="middle"
        fill={textColor}
        fontSize={period === '30d' ? 10 : 11}
        fontWeight={isSelected ? 900 : 800}
        className="tracking-tight"
      >
        {primaryText}
      </text>

      {/* Secondary Text (Weekday / Month) */}
      {secondaryText && (
        <text
          x={0}
          y={22}
          textAnchor="middle"
          fill={subTextColor}
          fontSize={8.5}
          fontWeight={isSelected ? 800 : 700}
          className="uppercase tracking-wider"
        >
          {secondaryText}
        </text>
      )}
    </g>
  );
};


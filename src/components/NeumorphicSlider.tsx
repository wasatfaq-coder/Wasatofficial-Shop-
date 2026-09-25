import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Minus, Plus } from 'lucide-react';

interface NeumorphicSliderProps {
  id?: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  icon?: React.ReactNode;
  subtitle?: string;
  recommendedValue?: number;
  onChange: (value: number) => void;
}

export const NeumorphicSlider: React.FC<NeumorphicSliderProps> = ({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  icon,
  subtitle,
  recommendedValue,
  onChange,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Percentage within bounds [0, 100]
  const clampedValue = Math.min(Math.max(value, min), max);
  const percent = ((clampedValue - min) / (max - min)) * 100;

  // Calculate value from pointer clientX
  const updateValueFromPointer = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const ratio = clickX / rect.width;
      const rawValue = min + ratio * (max - min);
      const steppedValue = Math.round(rawValue / step) * step;
      const finalValue = Math.min(Math.max(steppedValue, min), max);
      onChange(finalValue);
    },
    [min, max, step, onChange]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    updateValueFromPointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    updateValueFromPointer(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Pointer capture release safety
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(Math.min(max, value + step));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(Math.max(min, value - step));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(min);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(max);
    }
  };

  return (
    <div
      id={id}
      className="neu-inset rounded-2xl p-3.5 bg-[#E3E8EF] space-y-3 select-none transition-all duration-200 border border-white/40"
    >
      {/* Header: Label, Icon, and Stepper Controls */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {icon && (
            <div className="w-7 h-7 rounded-xl neu-button flex items-center justify-center text-accent shrink-0 bg-[#E3E8EF]">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <span className="text-xs font-extrabold text-[#2D3A4E] block truncate">
              {label}
            </span>
            {subtitle && (
              <span className="text-[11px] text-[#4E5C70] block truncate">
                {subtitle}
              </span>
            )}
          </div>
        </div>

        {/* Value and Step Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onChange(Math.max(min, value - step))}
            disabled={value <= min}
            aria-label={`Уменьшить ${label}`}
            className="w-6 h-6 rounded-lg neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Minus className="w-3 h-3 stroke-[2.5]" />
          </button>

          <div
            className={`px-2.5 py-1 rounded-xl font-extrabold text-xs tracking-tight transition-transform duration-100 ${
              isDragging
                ? 'neu-inset-deep text-accent scale-105 bg-[#E3E8EF]'
                : 'neu-inset text-accent bg-[#E3E8EF]'
            }`}
          >
            {value} <span className="text-[11px] font-bold text-[#4E5C70]">{unit}</span>
          </div>

          <button
            type="button"
            onClick={() => onChange(Math.min(max, value + step))}
            disabled={value >= max}
            aria-label={`Увеличить ${label}`}
            className="w-6 h-6 rounded-lg neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Plus className="w-3 h-3 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* Interactive Neumorphic Slider Track */}
      <div className="px-1 pt-1 pb-0.5">
        <div
          ref={trackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-label={label}
          className="relative w-full h-3 rounded-full neu-inset bg-[#D8DFEB] cursor-pointer touch-none select-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {/* Active Gradient Rail */}
          <div
            className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-accent to-[#7888EC] transition-[width] duration-75 ease-out"
            style={{ width: `${percent}%` }}
          >
            {isDragging && <div className="neu-progress-beam" />}
          </div>

          {/* Recommended marker if present (subtle recessed dot on track rail) */}
          {recommendedValue && (
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#4E5C70]/40 pointer-events-none z-0"
              style={{
                left: `${((recommendedValue - min) / (max - min)) * 100}%`,
              }}
              title={`Рекомендуемое: ${recommendedValue} ${unit}`}
            />
          )}

          {/* Neumorphic Tactile Convex Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none z-10 flex items-center justify-center"
            style={{
              left: `${percent}%`,
            }}
          >
            <div
              className={`w-6 h-6 rounded-full bg-[#E3E8EF] flex items-center justify-center border-2 border-white transition-transform duration-100 ease-out ${
                isDragging
                  ? 'scale-115 shadow-[2px_2px_5px_rgba(150,163,185,0.9),-2px_-2px_5px_rgba(255,255,255,1)] ring-4 ring-accent/25'
                  : 'shadow-[3px_3px_6px_rgba(150,163,185,0.75),-3px_-3px_6px_rgba(255,255,255,1)] hover:scale-105'
              }`}
            >
              {/* Center Tactile Accent Core */}
              <div
                className={`w-2.5 h-2.5 rounded-full shadow-inner transition-all duration-150 ${
                  isDragging ? 'bg-accent scale-110' : 'bg-accent'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Min & Max Labels */}
        <div className="flex justify-between items-center text-[11px] font-bold text-[#4E5C70] pt-2 px-0.5">
          <span>{min} {unit}</span>
          {recommendedValue && (
            <span className="text-[11px] font-semibold text-accent/80">
              База: {recommendedValue} {unit}
            </span>
          )}
          <span>{max} {unit}</span>
        </div>
      </div>
    </div>
  );
};

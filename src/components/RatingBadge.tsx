import React from 'react';
import { Star } from 'lucide-react';

interface RatingBadgeProps {
  rating: number;
  reviewsCount?: number;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  variant?: 'flat' | 'photo';
  className?: string;
}

export const RatingBadge: React.FC<RatingBadgeProps> = ({
  rating,
  reviewsCount,
  showLabel = false,
  size = 'sm',
  variant = 'flat',
  className = '',
}) => {
  const formattedRating = (Math.round((rating || 5) * 10) / 10).toFixed(1);

  if (variant === 'flat') {
    return (
      <div
        className={`neu-flat text-accent font-extrabold text-[11px] px-3 py-1 rounded-full uppercase tracking-wider inline-flex items-center justify-center gap-1.5 shrink-0 leading-none ${className}`}
      >
        <Star className="w-2.5 h-2.5 fill-accent text-accent shrink-0" strokeWidth={0} />
        {showLabel && <span>Рейтинг</span>}
        <span>{formattedRating}</span>
        {reviewsCount !== undefined && showLabel && (
          <span className="opacity-80 font-bold">({reviewsCount})</span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-full neu-photo-badge text-[#2D3A4E] font-bold inline-flex items-center justify-center shrink-0 leading-none ${
        size === 'sm' ? 'h-6 px-2.5 text-[11px] gap-1' : 'h-7 px-3 text-xs gap-1.5'
      } ${className}`}
    >
      <Star
        className={`${
          size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'
        } fill-[#4E5C70] text-[#4E5C70] shrink-0`}
        strokeWidth={0}
      />
      {showLabel && <span className="text-[#4E5C70] font-semibold text-[11px]">Рейтинг</span>}
      <span className="font-bold">{formattedRating}</span>
      {reviewsCount !== undefined && showLabel && (
        <span className="text-[#4E5C70] font-normal text-[11px]">({reviewsCount})</span>
      )}
    </div>
  );
};

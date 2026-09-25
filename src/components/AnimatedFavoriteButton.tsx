import React, { useState } from 'react';
import { Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AnimatedFavoriteButtonProps {
  isFavorite: boolean;
  onToggle: (e: React.MouseEvent) => void;
  className?: string;
  iconClassName?: string;
  size?: 'sm' | 'md' | 'lg';
  ariaLabel?: string;
}

export const AnimatedFavoriteButton: React.FC<AnimatedFavoriteButtonProps> = ({
  isFavorite,
  onToggle,
  className = '',
  iconClassName = '',
  size = 'md',
  ariaLabel = 'В избранное',
}) => {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAnimating(true);
    onToggle(e);
  };

  // Dimensional presets
  const sizeMap = {
    sm: {
      btn: 'w-7 h-7',
      icon: 'w-3.5 h-3.5',
    },
    md: {
      btn: 'w-8 h-8',
      icon: 'w-4 h-4',
    },
    lg: {
      btn: 'w-10 h-10',
      icon: 'w-5 h-5',
    },
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      whileTap={{ scale: 0.82 }}
      className={`relative rounded-full flex items-center justify-center cursor-pointer select-none outline-none focus:outline-none transition-colors ${currentSize.btn} ${className}`}
      aria-label={ariaLabel}
      title={isFavorite ? 'Удалить из избранного' : 'Добавить в избранное'}
    >
      {/* Pulse Aura Burst on favorite click */}
      <AnimatePresence>
        {isFavorite && isAnimating && (
          <motion.span
            key="favorite-pulse-aura"
            initial={{ scale: 0.6, opacity: 0.9 }}
            animate={{ scale: 2.2, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            onAnimationComplete={() => setIsAnimating(false)}
            className="absolute inset-0 rounded-full bg-rose-500/35 pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Pulsing and scaling heart icon */}
      <motion.div
        key={isFavorite ? 'fav-active' : 'fav-inactive'}
        initial={{ scale: 1 }}
        animate={
          isFavorite
            ? {
                scale: [1, 1.42, 0.88, 1.18, 1],
                rotate: [0, -14, 12, -6, 0],
              }
            : {
                scale: [1, 0.82, 1.05, 1],
              }
        }
        transition={{
          duration: 0.48,
          ease: [0.175, 0.885, 0.32, 1.275], // springy cubic bezier
        }}
        className="flex items-center justify-center pointer-events-none"
      >
        <Heart
          className={`${currentSize.icon} transition-colors duration-200 ${
            isFavorite
              ? 'fill-rose-500 text-rose-500 stroke-rose-500 drop-shadow-xs'
              : 'text-[#5C6B80] stroke-[1.8] hover:text-[#2D3A4E]'
          } ${iconClassName}`}
        />
      </motion.div>
    </motion.button>
  );
};

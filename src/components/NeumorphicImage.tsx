import React, { useState, useEffect } from 'react';
import { currentStoreName } from '../utils/storeContacts';

export interface NeumorphicImageProps {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  loading?: 'lazy' | 'eager';
  priority?: boolean;
  rootMargin?: string;
  threshold?: number;
}

export const NeumorphicImage: React.FC<NeumorphicImageProps> = ({
  src,
  alt,
  className = '',
  containerClassName = '',
  loading = 'lazy',
  priority = false,
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Reset loading and error states when image source changes
  useEffect(() => {
    setHasError(false);
    setIsLoaded(false);
  }, [src]);

  return (
    <div
      className={`relative overflow-hidden bg-[#D8DFE8] flex items-center justify-center ${containerClassName}`}
    >
      {/* Neumorphic Static/Lightweight Shimmer Placeholder while image loads */}
      {!isLoaded && !hasError && (
        <div
          className="absolute inset-0 bg-[#D8DFE8] overflow-hidden flex items-center justify-center pointer-events-none z-0"
          aria-hidden="true"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#C8D1DE]/30 to-transparent" />
        </div>
      )}

      {/* Render Image with native browser lazy loading and asynchronous decoding */}
      {!hasError && src && (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : loading}
          decoding="async"
          onLoad={() => setIsLoaded(true)}
          onError={() => {
            setHasError(true);
            setIsLoaded(true);
          }}
          className={`transition-opacity duration-200 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          } ${className}`}
        />
      )}

      {/* Fallback Single Neutral Gray Placeholder */}
      {hasError && (
        <div className="flex flex-col items-center justify-center p-3 text-[#4E5C70] select-none w-full h-full bg-[#D8DFE8]">
          <span className="text-[11px] font-semibold text-[#4E5C70] text-center line-clamp-1 px-1">
            {alt || currentStoreName()}
          </span>
        </div>
      )}
    </div>
  );
};


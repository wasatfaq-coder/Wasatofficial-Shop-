import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDialogA11y } from '../utils/useDialogA11y';

/** How far one arrow press moves the zoomed photo, px */
const PAN_STEP = 60;

interface ProductImageZoomModalProps {
  isOpen: boolean;
  images: string[];
  initialIndex?: number;
  /** The photo on screen: its full version is read only now (docs/catalog-scale-plan.md, stage 4) */
  onIndexChange?: (index: number) => void;
  productTitle: string;
  onClose: () => void;
}

export const ProductImageZoomModal: React.FC<ProductImageZoomModalProps> = ({
  isOpen,
  images,
  initialIndex = 0,
  onIndexChange,
  productTitle,
  onClose,
}) => {
  const dialog = useDialogA11y(isOpen, onClose, { label: 'Просмотр фото' });
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = React.useRef<HTMLImageElement>(null);

  /** The zoomed photo moves no further than its own edge: arrows cannot lose it off screen */
  const clampPan = (offset: { x: number; y: number }, zoom: number) => {
    const img = imageRef.current;
    if (!img || zoom <= 1) return { x: 0, y: 0 };
    const maxX = ((zoom - 1) * img.offsetWidth) / 2;
    const maxY = ((zoom - 1) * img.offsetHeight) / 2;
    return {
      x: Math.min(maxX, Math.max(-maxX, offset.x)),
      y: Math.min(maxY, Math.max(-maxY, offset.y)),
    };
  };

  // Reset zoom on index change
  React.useEffect(() => {
    setCurrentIndex(initialIndex);
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }, [initialIndex, isOpen]);

  React.useEffect(() => {
    if (isOpen) onIndexChange?.(currentIndex);
  }, [isOpen, currentIndex, onIndexChange]);

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % images.length);
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleZoomIn = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setZoomLevel((prev) => Math.min(prev + 0.5, 3));
  };

  const handleZoomOut = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const next = Math.max(zoomLevel - 0.5, 1);
    setZoomLevel(next);
    setPanOffset((prev) => clampPan(prev, next));
  };

  const handleResetZoom = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Pointer events: the zoomed photo moves with a finger, a pen or a mouse (WCAG 2.5.1, audit 07.10, finding 28)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoomLevel <= 1 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || zoomLevel <= 1) return;
    setPanOffset(clampPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }, zoomLevel));
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  /** Keyboard: + and − zoom, arrows move the zoomed photo or, at 100 %, switch photos (WCAG 2.1.1) */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      handleZoomIn();
      return;
    }
    if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      handleZoomOut();
      return;
    }
    if (e.key === '0') {
      e.preventDefault();
      handleResetZoom();
      return;
    }
    const step: Record<string, [number, number]> = {
      ArrowLeft: [PAN_STEP, 0],
      ArrowRight: [-PAN_STEP, 0],
      ArrowUp: [0, PAN_STEP],
      ArrowDown: [0, -PAN_STEP],
    };
    const move = step[e.key];
    if (!move) return;
    if (zoomLevel > 1) {
      e.preventDefault();
      setPanOffset((prev) => clampPan({ x: prev.x + move[0], y: prev.y + move[1] }, zoomLevel));
    } else if (images.length > 1 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      if (e.key === 'ArrowLeft') handlePrev();
      else handleNext();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={dialog.ref}
          {...dialog.props}
          key="product-image-zoom-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-[#1C2836]/90 backdrop-blur-md p-3 sm:p-6 select-none"
          onKeyDown={handleKeyDown}
          aria-describedby="zoom-keys-hint"
        >
          <p id="zoom-keys-hint" className="sr-only">
            Плюс и минус меняют масштаб, стрелки двигают увеличенное фото, а без увеличения листают фото.
          </p>
          {/* Top Floating Control Bar */}
          <div className="w-full max-w-4xl flex items-center justify-between gap-2 sm:gap-3 z-20 shrink-0">
            {/* Title and Angle info */}
            <div className="h-11 sm:h-12 flex-1 min-w-0 px-3 sm:px-4 rounded-2xl neu-flat flex items-center gap-2.5 border border-white/80">
              <div className="w-7 h-7 rounded-xl neu-inset flex items-center justify-center text-accent shrink-0 border border-white/60">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 truncate">
                <span className="text-xs sm:text-sm font-extrabold text-[#2D3A4E] leading-none truncate block">
                  {productTitle}
                </span>
                <span className="text-[11px] text-[#4E5C70] font-bold leading-tight truncate block mt-0.5">
                  Фото {currentIndex + 1} из {images.length}
                </span>
              </div>
            </div>

            {/* Zoom Level & Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Zoom toolbar */}
              <div className="h-11 sm:h-12 neu-flat rounded-2xl px-2 sm:px-2.5 flex items-center gap-1.5 border border-white/80">
                <button
                  onClick={handleZoomOut}
                  disabled={zoomLevel <= 1}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-[#2D3A4E] hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer select-none"
                  title="Уменьшить"
                  aria-label="Уменьшить"
                >
                  <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
                </button>
                <button
                  onClick={handleResetZoom}
                  className="h-7 sm:h-8 px-2.5 sm:px-3 text-[11px] sm:text-xs font-extrabold text-accent neu-button rounded-xl flex items-center justify-center border border-accent/20 transition-all cursor-pointer select-none"
                  title="Сбросить масштаб"
                >
                  {Math.round(zoomLevel * 100)}%
                </button>
                <button
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= 3}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-[#2D3A4E] hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer select-none"
                  title="Увеличить"
                  aria-label="Увеличить"
                >
                  <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
                </button>
              </div>

              {/* Close modal button */}
              <button
                onClick={onClose}
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl neu-button flex items-center justify-center text-[#2D3A4E] hover:text-danger transition-all cursor-pointer border border-white/80 shrink-0 select-none"
                title="Закрыть"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
              </button>
            </div>
          </div>

          {/* Central Zoom Canvas Viewport */}
          <div
            className={`relative w-full max-w-3xl flex-1 flex items-center justify-center overflow-hidden my-4 rounded-3xl neu-inset ${
              zoomLevel > 1 ? `touch-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}` : 'cursor-zoom-in'
            }`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClick={(e) => {
              if (zoomLevel === 1) {
                handleZoomIn(e);
              }
            }}
          >
            {/* Main Image */}
            <motion.img
              ref={imageRef}
              key={currentIndex}
              src={images[currentIndex]}
              alt={`${productTitle}, фото ${currentIndex + 1}`}
              className="max-h-[75vh] w-auto object-contain rounded-2xl transition-transform duration-100 pointer-events-none select-none"
              style={{
                transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${
                  panOffset.y / zoomLevel
                }px)`,
              }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: zoomLevel }}
              transition={{ duration: 0.2 }}
            />

            {/* Navigation Arrows */}
            {images.length > 1 && (
              <>
                <button
                  onClick={handlePrev}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-2xl neu-photo-btn flex items-center justify-center text-[#2D3A4E] z-20 cursor-pointer hover:scale-105 transition-transform"
                  title="Предыдущий ракурс"
                  aria-label="Предыдущий ракурс"
                >
                  <ChevronLeft className="w-6 h-6 stroke-[2.5]" />
                </button>
                <button
                  onClick={handleNext}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-2xl neu-photo-btn flex items-center justify-center text-[#2D3A4E] z-20 cursor-pointer hover:scale-105 transition-transform"
                  title="Следующий ракурс"
                  aria-label="Следующий ракурс"
                >
                  <ChevronRight className="w-6 h-6 stroke-[2.5]" />
                </button>
              </>
            )}

            {/* Zoom Tip Overlay */}
            {zoomLevel === 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 neu-photo-badge text-[#2D3A4E] text-[11px] font-bold px-3.5 py-1.5 rounded-full z-10 flex items-center gap-1.5 pointer-events-none">
                <ZoomIn className="w-3.5 h-3.5 text-accent" />
                <span>Нажмите, чтобы увеличить (до 300%)</span>
              </div>
            )}
          </div>

          {/* Bottom Angle Thumbnails Ribbon */}
          <div className="w-full max-w-3xl flex items-center justify-center gap-2 overflow-x-auto no-scrollbar py-2 z-20">
            {images.map((img, idx) => (
              <button
                key={`zoom-thumb-${img.slice(-20)}-${idx}`}
                onClick={() => {
                  setCurrentIndex(idx);
                  setZoomLevel(1);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className={`p-1 rounded-2xl transition-all cursor-pointer ${
                  currentIndex === idx ? 'neu-pill-active' : 'neu-button opacity-75 hover:opacity-100'
                }`}
                aria-label={`Фото ${idx + 1} из ${images.length}`}
                aria-current={currentIndex === idx}
              >
                <img
                  src={img}
                  alt=""
                  className="w-12 h-12 sm:w-14 sm:h-14 object-cover object-top rounded-xl"
                />
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

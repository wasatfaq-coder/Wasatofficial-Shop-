import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ProductImageZoomModalProps {
  isOpen: boolean;
  images: string[];
  initialIndex?: number;
  productTitle: string;
  onClose: () => void;
}

export const ANGLE_LABELS = [
  'Вид спереди',
  'Вид сзади',
  'Детали кроя и текстура',
  'На модели',
  'Крупный план',
  'Ракурс сбоку',
];

export const ProductImageZoomModal: React.FC<ProductImageZoomModalProps> = ({
  isOpen,
  images,
  initialIndex = 0,
  productTitle,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Reset zoom on index change
  React.useEffect(() => {
    setCurrentIndex(initialIndex);
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }, [initialIndex, isOpen]);

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
    setZoomLevel((prev) => {
      const next = Math.max(prev - 0.5, 1);
      if (next === 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoomLevel > 1) {
      setPanOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="product-image-zoom-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-[#1C2836]/90 backdrop-blur-md p-3 sm:p-6 select-none"
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Top Floating Control Bar */}
          <div className="w-full max-w-4xl flex items-center justify-between gap-2 sm:gap-3 z-20 shrink-0">
            {/* Title and Angle info */}
            <div className="h-11 sm:h-12 flex-1 min-w-0 px-3 sm:px-4 rounded-2xl neu-flat bg-[#E3E8EF] flex items-center gap-2.5 border border-white/80">
              <div className="w-7 h-7 rounded-xl neu-inset bg-[#E3E8EF] flex items-center justify-center text-accent shrink-0 border border-white/60">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 truncate">
                <span className="text-xs sm:text-sm font-black text-[#2D3A4E] leading-none truncate block">
                  {productTitle}
                </span>
                <span className="text-[11px] text-[#4E5C70] font-bold leading-tight truncate block mt-0.5">
                  {ANGLE_LABELS[currentIndex % ANGLE_LABELS.length]} • Ракурс {currentIndex + 1} из{' '}
                  {images.length}
                </span>
              </div>
            </div>

            {/* Zoom Level & Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Zoom toolbar */}
              <div className="h-11 sm:h-12 neu-flat rounded-2xl px-2 sm:px-2.5 bg-[#E3E8EF] flex items-center gap-1.5 border border-white/80">
                <button
                  onClick={handleZoomOut}
                  disabled={zoomLevel <= 1}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-[#2D3A4E] hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed active:scale-90 transition-all cursor-pointer select-none"
                  title="Уменьшить"
                  aria-label="Уменьшить"
                >
                  <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
                </button>
                <button
                  onClick={handleResetZoom}
                  className="h-7 sm:h-8 px-2.5 sm:px-3 text-[11px] sm:text-xs font-black text-accent neu-inset bg-[#E3E8EF] rounded-xl flex items-center justify-center border border-accent/20 active:scale-95 transition-all cursor-pointer select-none"
                  title="Сбросить масштаб"
                >
                  {Math.round(zoomLevel * 100)}%
                </button>
                <button
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= 3}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl neu-button flex items-center justify-center text-[#2D3A4E] hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed active:scale-90 transition-all cursor-pointer select-none"
                  title="Увеличить"
                  aria-label="Увеличить"
                >
                  <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
                </button>
              </div>

              {/* Close modal button */}
              <button
                onClick={onClose}
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl neu-button flex items-center justify-center text-[#2D3A4E] hover:text-danger active:scale-90 transition-all cursor-pointer bg-[#E3E8EF] border border-white/80 shrink-0 select-none"
                title="Закрыть"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
              </button>
            </div>
          </div>

          {/* Central Zoom Canvas Viewport */}
          <div
            className={`relative w-full max-w-3xl flex-1 flex items-center justify-center overflow-hidden my-4 rounded-3xl neu-inset bg-[#E3E8EF]/95 ${
              zoomLevel > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
            }`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onClick={(e) => {
              if (zoomLevel === 1) {
                handleZoomIn(e);
              }
            }}
          >
            {/* Main Image */}
            <motion.img
              key={currentIndex}
              src={images[currentIndex]}
              alt={`${productTitle} - ${ANGLE_LABELS[currentIndex % ANGLE_LABELS.length]}`}
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
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-2xl neu-photo-btn flex items-center justify-center text-[#2D3A4E] z-20 cursor-pointer hover:scale-105 active:scale-95 transition-transform"
                  title="Предыдущий ракурс"
                  aria-label="Предыдущий ракурс"
                >
                  <ChevronLeft className="w-6 h-6 stroke-[2.5]" />
                </button>
                <button
                  onClick={handleNext}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-2xl neu-photo-btn flex items-center justify-center text-[#2D3A4E] z-20 cursor-pointer hover:scale-105 active:scale-95 transition-transform"
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
                <span>Кликните для увеличения (до 300%)</span>
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
                className={`p-1 rounded-2xl transition-all flex items-center gap-2 cursor-pointer ${
                  currentIndex === idx
                    ? 'neu-inset ring-2 ring-accent bg-[#E3E8EF] scale-105'
                    : 'neu-button bg-[#E3E8EF] opacity-75 hover:opacity-100'
                }`}
              >
                <img
                  src={img}
                  alt=""
                  className="w-12 h-12 sm:w-14 sm:h-14 object-cover object-top rounded-xl"
                />
                <span className="hidden sm:inline-block pr-2 text-left text-[11px] font-bold text-[#2D3A4E] max-w-[100px] leading-tight">
                  {ANGLE_LABELS[idx % ANGLE_LABELS.length]}
                </span>
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

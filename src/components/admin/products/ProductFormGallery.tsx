import React from 'react';
import { Trash2, Image as ImageIcon, ImagePlus, ArrowLeft, ArrowRight, Maximize2, Loader2 } from 'lucide-react';
import { processImageFiles } from '../../../utils/imageUpload';
import { formatMegabytes, PRODUCT_SIZE_BUDGET_BYTES } from '../../../utils/productSize';

import type { AdminProductsTabProps } from '../AdminProductsTab';
import type { ProductForm } from './useProductForm';

/** The product photos: from the device, a drop or a link; cover, order, delete and zoom */
export function ProductFormGallery({ form, onShowToast }: { form: ProductForm; onShowToast: AdminProductsTabProps['onShowToast'] }) {
  const {
    formImages,
    setFormImages,
    newImageUrlInput,
    setNewImageUrlInput,
    galleryFileInputRef,
    isUploadingImage,
    setIsUploadingImage,
    setPhotoError,
    isDraggingOverGallery,
    setIsDraggingOverGallery,
    setPreviewZoomImage,
    formSizeBytes,
    setPendingRemoval,
  } = form;

  // Gallery file upload and drag-and-drop handlers
  const handleGalleryFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await addPhotoFiles(files);
  };

  /**
   * Photos from the device or a drop: the gallery shows them, so no «Загружено» toast; a file that could not be read
   * is named in the form's error list (form messages go without toasts — UX audit 03.10, finding 17)
   */
  const addPhotoFiles = async (files: FileList) => {
    try {
      setIsUploadingImage(true);
      const loadedImages = await processImageFiles(files);
      if (loadedImages.length > 0) setFormImages((prev) => [...prev, ...loadedImages]);
      const skipped = files.length - loadedImages.length;
      setPhotoError(
        skipped <= 0
          ? null
          : loadedImages.length === 0
          ? 'Не удалось загрузить фото. Поддерживаются форматы JPG, PNG, WEBP'
          : `Не загружено ${skipped} из ${files.length} фото: поддерживаются форматы JPG, PNG, WEBP`
      );
    } catch (err) {
      console.error('Error processing gallery files:', err);
      setPhotoError('Не удалось прочитать фото. Попробуйте выбрать его ещё раз');
    } finally {
      setIsUploadingImage(false);
      if (galleryFileInputRef.current) {
        galleryFileInputRef.current.value = '';
      }
    }
  };

  const handleGalleryDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOverGallery(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    await addPhotoFiles(files);
  };

  const photoPreview = (src: string, label: string) => (
    <>
      <img src={src} alt="" className="w-12 h-12 rounded-xl object-cover neu-flat shrink-0" referrerPolicy="no-referrer" />
      <p className="font-extrabold text-xs text-[#2D3A4E] min-w-0">{label}</p>
    </>
  );

  const handleDeleteImage = (indexToDelete: number) => {
    const src = formImages[indexToDelete];
    setPendingRemoval({
      title: 'Удалить фото?',
      message:
        indexToDelete === 0
          ? 'Это обложка товара. Обложкой станет следующее фото.'
          : 'Фото исчезнет из галереи товара после сохранения.',
      preview: src ? photoPreview(src, indexToDelete === 0 ? 'Обложка' : `Фото ${indexToDelete + 1}`) : undefined,
      run: () => {
        setFormImages((prev) => prev.filter((_, idx) => idx !== indexToDelete));
        onShowToast('Фото удалено из галереи', 'info');
      },
    });
  };

  const handleSetCoverImage = (indexToCover: number) => {
    if (indexToCover === 0) return;
    setFormImages((prev) => {
      const target = prev[indexToCover];
      const rest = prev.filter((_, idx) => idx !== indexToCover);
      return [target, ...rest];
    });
    onShowToast('Фото назначено главной обложкой', 'success');
  };

  const handleMoveImage = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= formImages.length) return;
    setFormImages((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, item);
      return copy;
    });
  };

  const handleClearAllImages = () => {
    setPendingRemoval({
      title: 'Удалить все фото?',
      message: `Будут удалены все фото (${formImages.length}). Без фото товар нельзя сохранить.`,
      preview: formImages[0] ? photoPreview(formImages[0], `Фото в галерее: ${formImages.length}`) : undefined,
      confirmLabel: 'Удалить все',
      run: () => {
        setFormImages([]);
        onShowToast('Все фото товара удалены', 'info');
      },
    });
  };

  return (
    <>
      {/* Multi-Photo Gallery Manager */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md neu-inset flex items-center justify-center text-accent">
              <ImageIcon className="w-3 h-3" />
            </div>
            <span className="text-[11px] font-extrabold text-[#2D3A4E]">Галерея фото</span>
            <span className="text-[11px] font-extrabold px-1.5 py-0.2 rounded-md neu-inset text-accent">
              {formImages.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-[#4E5C70]">Первое фото — обложка</span>
            {formImages.length > 0 && (
              <button
                type="button"
                onClick={handleClearAllImages}
                className="h-6 px-2.5 rounded-lg neu-button-danger text-[11px] font-extrabold transition-all cursor-pointer flex items-center gap-1"
                title="Удалить все фото"
              >
                <Trash2 className="w-2.5 h-2.5" />
                <span>Очистить все</span>
              </button>
            )}
          </div>
        </div>

        {/* Photos live inside the product document (up to 1 MiB): show how much space is left */}
        {formImages.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-[#4E5C70]">Место под фото и описание</span>
              <span className={formSizeBytes > PRODUCT_SIZE_BUDGET_BYTES ? 'text-danger' : formSizeBytes > PRODUCT_SIZE_BUDGET_BYTES * 0.8 ? 'text-warning' : 'text-[#2D3A4E]'}>
                {formatMegabytes(formSizeBytes)} из {formatMegabytes(PRODUCT_SIZE_BUDGET_BYTES)}
              </span>
            </div>
            <div
              className="h-1.5 rounded-full neu-inset overflow-hidden"
              role="meter"
              aria-label="Место под фото и описание"
              aria-valuemin={0}
              aria-valuemax={PRODUCT_SIZE_BUDGET_BYTES}
              aria-valuenow={Math.min(formSizeBytes, PRODUCT_SIZE_BUDGET_BYTES)}
            >
              <div
                className={`h-full rounded-full ${formSizeBytes > PRODUCT_SIZE_BUDGET_BYTES ? 'bg-danger' : formSizeBytes > PRODUCT_SIZE_BUDGET_BYTES * 0.8 ? 'bg-warning' : 'bg-accent'}`}
                style={{ width: `${Math.min(100, (formSizeBytes / PRODUCT_SIZE_BUDGET_BYTES) * 100)}%` }}
              />
            </div>
            {formSizeBytes > PRODUCT_SIZE_BUDGET_BYTES && (
              <p className="text-xs font-bold text-danger">Не поместится в базу: уберите часть фото.</p>
            )}
          </div>
        )}
        {/* Product pages for messengers are rebuilt every hour (share-pages.yml, docs/seo-plan.md) */}
        <p className="text-xs text-[#4E5C70]">
          Превью ссылки на товар в Telegram и WhatsApp обновится в течение часа после сохранения.
        </p>

        {/* Hidden Native File Input for Gallery / Device Upload */}
        <input
          ref={galleryFileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleGalleryFileSelect}
          className="hidden"
        />

        {/* Image Upload Actions & Drag-and-Drop Area */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingOverGallery(true);
          }}
          onDragLeave={() => setIsDraggingOverGallery(false)}
          onDrop={handleGalleryDrop}
          className={`p-3 neu-inset rounded-2xl transition-all space-y-2.5 ${
            isDraggingOverGallery
              ? 'border-2 border-dashed border-accent bg-accent/5'
              : 'border border-white/60 bg-[#E3E8EF]'
          }`}
        >
          {/* Top Action Bar: Upload from Device + Loading state */}
          <button
            type="button"
            onClick={() => galleryFileInputRef.current?.click()}
            disabled={isUploadingImage}
            className="w-full py-2.5 px-3 neu-button rounded-xl text-xs font-extrabold text-accent hover:text-accent-strong flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            {isUploadingImage ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-accent" />
                <span>Обработка изображений...</span>
              </>
            ) : (
              <>
                <ImagePlus className="w-4 h-4 text-accent" />
                <span>Загрузить из галереи / с устройства</span>
              </>
            )}
          </button>

          {/* Image Thumbnails Strip & Controls */}
          {formImages.length === 0 ? (
            <div
              onClick={() => galleryFileInputRef.current?.click()}
              className="py-6 px-4 rounded-xl border border-dashed border-[#BAC5D5] flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:bg-white/40 transition-colors text-center"
            >
              <ImagePlus className="w-6 h-6 text-[#4E5C70]" />
              <p className="text-xs font-bold text-[#2D3A4E]">Галерея пока пуста</p>
              <p className="text-xs text-[#4E5C70]">
                Добавьте хотя бы одно фото — без него товар не сохранить
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
              {formImages.map((imgUrl, idx) => (
                <div
                  key={idx}
                  className={`relative rounded-xl overflow-hidden neu-flat border-2 group transition-all aspect-[3/4] flex flex-col justify-between ${
                    idx === 0 ? 'border-accent' : 'border-white/80'
                  }`}
                >
                  <img
                    src={imgUrl}
                    alt={`Фото ${idx + 1}`}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => setPreviewZoomImage(imgUrl)}
                    referrerPolicy="no-referrer"
                  />

                  {/* Cover Badge */}
                  {idx === 0 && (
                    <div className="absolute top-1.5 left-1.5 bg-accent text-white text-[11px] font-extrabold px-1.5 py-0.5 rounded-md shadow-sm">
                      <span>Главная</span>
                    </div>
                  )}

                  {/* ALWAYS VISIBLE Quick Delete Button on Top Right */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteImage(idx);
                    }}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-danger hover:bg-danger/90 text-white flex items-center justify-center shadow-[var(--neu-on-photo)] active:scale-90 transition-transform cursor-pointer z-10"
                    title="Удалить это фото"
                    aria-label="Удалить это фото"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Bottom Action Bar for Cover & Reordering */}
                  {/* 24 px buttons (UX audit 03.10, finding 15): on a narrow photo «Обложка» goes to a second row */}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-1.5 flex flex-wrap items-center justify-between gap-1 text-white">
                    <div className="flex items-center gap-1">
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveImage(idx, idx - 1);
                          }}
                          className="w-6 h-6 flex items-center justify-center rounded bg-white/20 hover:bg-white/40 text-white cursor-pointer"
                          title="Переместить левее"
                          aria-label="Переместить левее"
                        >
                          <ArrowLeft className="w-3 h-3" />
                        </button>
                      )}
                      {idx < formImages.length - 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveImage(idx, idx + 1);
                          }}
                          className="w-6 h-6 flex items-center justify-center rounded bg-white/20 hover:bg-white/40 text-white cursor-pointer"
                          title="Переместить правее"
                          aria-label="Переместить правее"
                        >
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1 ml-auto">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewZoomImage(imgUrl);
                        }}
                        className="w-6 h-6 flex items-center justify-center rounded bg-white/20 hover:bg-white/40 text-white cursor-pointer"
                        title="Увеличить фото"
                        aria-label="Увеличить фото"
                      >
                        <Maximize2 className="w-3 h-3" />
                      </button>
                      {idx !== 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetCoverImage(idx);
                          }}
                          className="min-h-6 text-[11px] font-extrabold bg-accent hover:bg-accent text-white px-1.5 py-0.5 rounded cursor-pointer"
                          title="Сделать главной обложкой"
                        >
                          Обложка
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Image by URL Input */}
          <div data-enter-adds className="flex gap-1.5 pt-1">
            <input
              type="url"
              aria-label="Ссылка на фото"
              value={newImageUrlInput}
              onChange={(e) => setNewImageUrlInput(e.target.value)}
              placeholder="Ссылка на фото (https://…)"
              className="flex-1 min-w-0 h-9 px-3 neu-inset rounded-xl text-xs text-[#2D3A4E] placeholder:text-[#56647A]"
            />
            <button
              type="button"
              onClick={() => {
                // the photo appears in the gallery above: no toast
                if (newImageUrlInput.trim()) {
                  setFormImages([...formImages, newImageUrlInput.trim()]);
                  setNewImageUrlInput('');
                  setPhotoError(null);
                }
              }}
              disabled={!newImageUrlInput.trim()}
              className="h-9 px-3 neu-button rounded-xl text-xs font-bold text-accent disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0 whitespace-nowrap"
            >
              + Ссылка
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

import React from 'react';
import { Trash2, Image as ImageIcon, ImagePlus, Camera, ArrowLeft, ArrowRight, Maximize2, Loader2 } from 'lucide-react';
import { processImageFiles } from '../../../utils/imageUpload';
import { moveMap, remapColorImages, removalMap } from '../../../utils/colorPhotos';
import { formatMegabytes, PRODUCT_SIZE_BUDGET_BYTES } from '../../../utils/productSize';

import { AdminHint } from '../AdminHint';
import type { AdminProductsTabProps } from '../AdminProductsTab';
import type { ProductForm } from './useProductForm';

/** The product photos: from the device, a drop or a link; cover, order, delete and zoom */
export function ProductFormGallery({ form, onShowToast }: { form: ProductForm; onShowToast: AdminProductsTabProps['onShowToast'] }) {
  const {
    formImages,
    setFormImages,
    setFormColors,
    newImageUrlInput,
    setNewImageUrlInput,
    galleryFileInputRef,
    cameraFileInputRef,
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
      if (cameraFileInputRef.current) {
        cameraFileInputRef.current.value = '';
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
      <p className="font-extrabold text-xs text-text-primary min-w-0">{label}</p>
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
        setFormColors((prev) => remapColorImages(prev, removalMap(formImages.length, indexToDelete)));
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
    setFormColors((prev) => remapColorImages(prev, moveMap(formImages.length, indexToCover, 0)));
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
    setFormColors((prev) => remapColorImages(prev, moveMap(formImages.length, fromIdx, toIdx)));
  };

  const handleClearAllImages = () => {
    setPendingRemoval({
      title: 'Удалить все фото?',
      message: `Будут удалены все фото (${formImages.length}). Без фото товар нельзя сохранить.`,
      preview: formImages[0] ? photoPreview(formImages[0], `Фото в галерее: ${formImages.length}`) : undefined,
      confirmLabel: 'Удалить все',
      run: () => {
        setFormImages([]);
        setFormColors((prev) => remapColorImages(prev, []));
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
            <span className="text-[11px] font-extrabold text-text-primary">Галерея фото *</span>
            <span className="text-[11px] font-extrabold px-1.5 py-0.2 rounded-md neu-inset text-accent">
              {formImages.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-0.5">
              <span className="text-[11px] font-bold text-text-secondary">Первое фото — обложка</span>
              <AdminHint label="Первое фото">Первое фото — обложка: его видят в каталоге и в ссылке.</AdminHint>
            </span>
            {formImages.length > 0 && (
              <button
                type="button"
                onClick={handleClearAllImages}
                className="h-8 px-2.5 rounded-lg neu-button-danger text-[11px] font-extrabold transition-all cursor-pointer flex items-center gap-1"
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
              <span className="inline-flex items-center gap-0.5 text-text-secondary">
                Место под фото и описание
                <AdminHint label="Место под фото и описание">Сколько места товар занимает в базе. Если заполнено, уберите часть фото.</AdminHint>
              </span>
              <span className={formSizeBytes > PRODUCT_SIZE_BUDGET_BYTES ? 'text-danger' : formSizeBytes > PRODUCT_SIZE_BUDGET_BYTES * 0.8 ? 'text-warning' : 'text-text-primary'}>
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
        <p className="text-xs text-text-secondary">
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
        {/* Hidden Native Camera Input (opens rear camera on phones) */}
        <input
          ref={cameraFileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
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
          className={`p-3 rounded-2xl transition-all space-y-2.5 ${
            isDraggingOverGallery
              ? 'neu-pill-active'
              : 'neu-inset'
          }`}
        >
          {/* Top Action Bar: Shoot with Camera + Upload from Gallery */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => cameraFileInputRef.current?.click()}
              disabled={isUploadingImage}
              className="py-2.5 px-3 neu-button rounded-xl text-xs font-extrabold text-accent hover:text-accent-strong flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              {isUploadingImage ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-accent shrink-0" />
                  <span className="truncate">Обработка…</span>
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4 text-accent shrink-0" />
                  <span className="truncate">Сделать фото</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => galleryFileInputRef.current?.click()}
              disabled={isUploadingImage}
              className="py-2.5 px-3 neu-button rounded-xl text-xs font-extrabold text-accent hover:text-accent-strong flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              {isUploadingImage ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-accent shrink-0" />
                  <span className="truncate">Обработка…</span>
                </>
              ) : (
                <>
                  <ImagePlus className="w-4 h-4 text-accent shrink-0" />
                  <span className="truncate">Из галереи</span>
                </>
              )}
            </button>
          </div>

          {/* Image Thumbnails Strip & Controls */}
          {formImages.length === 0 ? (
            <div
              onClick={() => galleryFileInputRef.current?.click()}
              className="py-6 px-4 rounded-xl neu-inset flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:opacity-90 transition-opacity text-center"
            >
              <ImagePlus className="w-6 h-6 text-text-secondary shrink-0" />
              <p className="text-xs font-bold text-text-primary">Галерея пока пуста</p>
              <p className="text-xs text-text-secondary">
                Добавьте хотя бы одно фото — без него товар не сохранить
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
              {formImages.map((imgUrl, idx) => (
                <div
                  key={idx}
                  className={`relative rounded-xl overflow-hidden group transition-all aspect-[3/4] flex flex-col justify-between ${
                    idx === 0 ? 'neu-pill-active' : 'neu-flat'
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
                    <div className="absolute top-1.5 left-1.5 neu-photo-btn-active text-[11px] font-extrabold px-2 py-0.5 rounded-lg">
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
                    className="absolute top-1.5 right-1.5 w-8 h-8 rounded-xl neu-photo-btn neu-photo-btn-danger flex items-center justify-center z-10 shrink-0"
                    title="Удалить это фото"
                    aria-label="Удалить это фото"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  </button>

                  {/* Bottom Action Bar for Cover & Reordering */}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent p-1.5 flex flex-wrap items-center justify-between gap-1">
                    <div className="flex items-center gap-1">
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveImage(idx, idx - 1);
                          }}
                          className="w-8 h-8 flex items-center justify-center rounded-xl neu-photo-btn shrink-0"
                          title="Переместить левее"
                          aria-label="Переместить левее"
                        >
                          <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                        </button>
                      )}
                      {idx < formImages.length - 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveImage(idx, idx + 1);
                          }}
                          className="w-8 h-8 flex items-center justify-center rounded-xl neu-photo-btn shrink-0"
                          title="Переместить правее"
                          aria-label="Переместить правее"
                        >
                          <ArrowRight className="w-3.5 h-3.5 shrink-0" />
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
                        className="w-8 h-8 flex items-center justify-center rounded-xl neu-photo-btn shrink-0"
                        title="Увеличить фото"
                        aria-label="Увеличить фото"
                      >
                        <Maximize2 className="w-3.5 h-3.5 shrink-0" />
                      </button>
                      {idx !== 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetCoverImage(idx);
                          }}
                          className="min-h-8 text-[11px] font-extrabold neu-photo-btn neu-photo-btn-active px-2 py-0.5 rounded-xl cursor-pointer shrink-0"
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
              className="flex-1 min-w-0 h-9 px-3 neu-inset rounded-xl text-xs text-text-primary placeholder:text-text-muted"
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
              className="h-9 px-3 neu-button rounded-xl text-xs font-bold text-accent disabled:cursor-not-allowed transition-all cursor-pointer shrink-0 whitespace-nowrap"
            >
              + Ссылка
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

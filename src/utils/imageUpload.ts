/**
 * Utility for client-side image processing, compression, and gallery loading.
 * Compresses images to optimized Base64 data URLs to ensure fast rendering,
 * low memory usage, and seamless Firestore document compatibility (strictly < 400KB).
 */

const MAX_FIRESTORE_IMAGE_BYTES = 400 * 1024; // 400KB safe ceiling (well below 1MB document limit)

async function compressImageFile(
  file: File,
  maxWidth = 1000,
  maxHeight = 1000,
  quality = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('Выбранный файл не является изображением'));
    }

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const rawDataUrl = readerEvent.target?.result as string;
      compressBase64Image(rawDataUrl, maxWidth, maxHeight, quality)
        .then(resolve)
        .catch(() => resolve(rawDataUrl));
    };

    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Specifically optimized for chat messages to keep Firestore documents very light (< 200KB).
 */
export async function compressChatImageFile(file: File): Promise<string> {
  return compressImageFile(file, 800, 800, 0.72);
}

/**
 * Compress an existing base64 image data URL to ensure it fits safely in Firestore.
 */
export async function compressBase64Image(
  dataUrl: string,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.75
): Promise<string> {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      return resolve(dataUrl);
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Scale down proportionally while strictly preserving aspect ratio
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.max(1, Math.round(width * ratio));
        height = Math.max(1, Math.round(height * ratio));
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return resolve(dataUrl);
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      let currentQuality = quality;
      let result = '';

      try {
        result = canvas.toDataURL('image/jpeg', currentQuality);
      } catch {
        return resolve(dataUrl);
      }

      // If still exceeding 400KB, iteratively scale down and reduce quality
      let attempts = 0;
      while (result.length > MAX_FIRESTORE_IMAGE_BYTES && attempts < 3) {
        attempts++;
        currentQuality -= 0.15;
        const newWidth = Math.max(1, Math.round(canvas.width * 0.75));
        const newHeight = Math.max(1, Math.round(canvas.height * 0.75));
        canvas.width = newWidth;
        canvas.height = newHeight;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, newWidth, newHeight);
        try {
          result = canvas.toDataURL('image/jpeg', Math.max(0.4, currentQuality));
        } catch {
          break;
        }
      }

      resolve(result);
    };

    img.onerror = () => {
      resolve(dataUrl);
    };

    img.src = dataUrl;
  });
}

export async function processImageFiles(files: FileList | File[]): Promise<string[]> {
  const fileArray = Array.from(files);
  const imageFiles = fileArray.filter((f) => f.type.startsWith('image/'));

  const results: string[] = [];
  for (const file of imageFiles) {
    try {
      const dataUrl = await compressImageFile(file);
      results.push(dataUrl);
    } catch (e) {
      console.warn('Failed to compress image:', file.name, e);
    }
  }

  return results;
}

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Product } from '../../../types';
import { NeumorphicSelect } from '../../NeumorphicSelect';
import { AdminHint } from '../AdminHint';
import { useProductPreviews } from '../../../utils/useProductPhotos';
import { loadProductPhotos } from '../../../utils/firebaseSync';
import { compressBase64Image } from '../../../utils/imageUpload';

interface BannerProductPhotosProps {
  products: Product[];
  /** The chosen photo, ready for the banner (a data: picture or the product's own link) */
  onPick: (src: string) => void;
  onError: (msg: string) => void;
}

/** The banner picture: sized like an uploaded one (`compressImageFile`) */
const BANNER_PHOTO_SIDE = 1400;
const BANNER_PHOTO_QUALITY = 0.82;

/**
 * Ready photos for a banner — the store's own product photos, not stock pictures (admin audit 09.10, stage 8,
 * finding 23; owner's choice А): a buyer must not see on the home screen things the store does not sell. The
 * list shows the product's previews; the chosen photo is read in full from `product_photos`.
 */
export const BannerProductPhotos: React.FC<BannerProductPhotosProps> = ({ products, onPick, onError }) => {
  const withPhotos = products.filter((p) => (p.images ?? []).length > 0);
  const [productId, setProductId] = useState('');
  const [picking, setPicking] = useState<number | null>(null);
  const product = withPhotos.find((p) => p.id === productId) ?? null;
  const previews = useProductPreviews(product);

  const pick = async (index: number) => {
    if (!product || picking !== null) return;
    setPicking(index);
    try {
      const photoId = product.photoIds?.[index];
      const full = photoId ? (await loadProductPhotos([photoId]))[photoId] : '';
      const src = full || previews[index] || '';
      if (src) onPick(await compressBase64Image(src, BANNER_PHOTO_SIDE, BANNER_PHOTO_SIDE, BANNER_PHOTO_QUALITY));
    } catch (err) {
      console.warn('Product photo for the banner was not read:', err);
      onError('Фото товара не загрузилось. Проверьте связь и попробуйте ещё раз');
    } finally {
      setPicking(null);
    }
  };

  if (withPhotos.length === 0) {
    return <p className="text-xs text-[#4E5C70]">Фото товаров появятся здесь, когда у товаров будут фото.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <span className="text-[11px] font-bold text-[#4E5C70]">Фото товара магазина:</span>
        <AdminHint label="Фото товара магазина">Фото подставится для телефона и компьютера. Потом его можно заменить своим.</AdminHint>
      </div>
      <NeumorphicSelect
        ariaLabel="Товар для фото баннера"
        value={productId}
        onChange={setProductId}
        options={[
          { value: '', label: '— Выберите товар —' },
          ...withPhotos.map((p) => ({ value: p.id, label: p.title })),
        ]}
      />
      {product && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {previews.map((src, index) => (
            <button
              key={index}
              type="button"
              onClick={() => void pick(index)}
              disabled={!src || picking !== null}
              aria-label={`Взять фото ${index + 1} из ${previews.length}: ${product.title}`}
              className="relative w-16 h-20 shrink-0 rounded-xl overflow-hidden neu-button cursor-pointer disabled:cursor-wait"
            >
              {src ? (
                <img src={src} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="block w-full h-full bg-[#D8DFE8]" />
              )}
              {picking === index && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="w-4 h-4 text-white animate-spin" aria-hidden="true" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

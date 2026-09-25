import React, { useMemo, useState } from 'react';
import { CheckCircle2, Replace } from 'lucide-react';
import { BannerSlide, DeliveryMethod, PickupPoint, PromoCode, StorefrontSettings } from '../../types';
import { getStoreName, publicSetting, withStoreNameFields } from '../../utils/storeContacts';
import { ConfirmDialog } from '../ConfirmDialog';

interface BrandRenameCardProps {
  settings: StorefrontSettings;
  deliveryMethods: DeliveryMethod[];
  pickupPoints: PickupPoint[];
  bannerSlides: BannerSlide[];
  promos: PromoCode[];
  onUpdateSettings?: (settings: StorefrontSettings) => void;
  onUpdateDeliveryMethods?: (methods: DeliveryMethod[]) => void;
  onUpdatePickupPoints?: (points: PickupPoint[]) => void;
  onUpdateBannerSlides?: (banners: BannerSlide[]) => void;
  onUpdatePromos?: (promos: PromoCode[]) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

/**
 * One-time rename of the template brand (MANSTYLE / ManStyle) and template wording stored in Firestore.
 * Customers already see the new name (App.tsx replaces it on display); this fixes the data itself.
 * Promo codes, ids and links are left unchanged (withStoreNameFields skips them).
 */
export const BrandRenameCard: React.FC<BrandRenameCardProps> = ({
  settings,
  deliveryMethods,
  pickupPoints,
  bannerSlides,
  promos,
  onUpdateSettings,
  onUpdateDeliveryMethods,
  onUpdatePickupPoints,
  onUpdateBannerSlides,
  onUpdatePromos,
  onShowToast,
}) => {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const newName = getStoreName(settings);
  const changes = (record: object) => JSON.stringify(withStoreNameFields(record, newName)) !== JSON.stringify(record);

  const found = useMemo(
    () => ({
      settings: changes(settings) || (settings.storeName || '').trim() !== newName,
      deliveryMethods: deliveryMethods.filter(changes).length,
      pickupPoints: pickupPoints.filter(changes).length,
      bannerSlides: bannerSlides.filter(changes).length,
      promos: promos.filter(changes).length,
    }),
    [settings, deliveryMethods, pickupPoints, bannerSlides, promos, newName]
  );

  const lines = [
    found.settings && 'настройки витрины (название, слоган, «Философия бренда»)',
    found.deliveryMethods > 0 && `способы доставки: ${found.deliveryMethods}`,
    found.pickupPoints > 0 && `пункты выдачи: ${found.pickupPoints}`,
    found.bannerSlides > 0 && `баннеры: ${found.bannerSlides}`,
    found.promos > 0 && `описания промокодов: ${found.promos}`,
  ].filter(Boolean) as string[];

  const handleRename = () => {
    if (found.settings && onUpdateSettings) {
      onUpdateSettings({
        ...withStoreNameFields(settings, newName),
        storeName: newName,
        // Template demo contacts are hidden from customers anyway; clear them so the owner fills real ones
        email: publicSetting(settings.email),
        telegram: publicSetting(settings.telegram),
      });
    }
    if (found.deliveryMethods > 0) onUpdateDeliveryMethods?.(deliveryMethods.map((m) => withStoreNameFields(m, newName)));
    if (found.pickupPoints > 0) onUpdatePickupPoints?.(pickupPoints.map((pt) => withStoreNameFields(pt, newName)));
    if (found.bannerSlides > 0) onUpdateBannerSlides?.(bannerSlides.map((b) => withStoreNameFields(b, newName)));
    if (found.promos > 0) onUpdatePromos?.(promos.map((p) => withStoreNameFields(p, newName)));
    onShowToast(`Старое название заменено на «${newName}»`, 'success');
  };

  return (
    <div className="neu-flat rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl neu-inset flex items-center justify-center text-[#4B59BB] shrink-0">
          <Replace className="w-4 h-4" />
        </div>
        <div className="min-w-0 space-y-1">
          <h4 className="text-sm font-black text-[#2D3A4E]">Название магазина в данных</h4>
          {lines.length > 0 ? (
            <p className="text-xs text-[#4E5C70] leading-relaxed">
              В базе остались тексты шаблона со старым названием MANSTYLE: {lines.join('; ')}. Покупатели уже видят «{newName}», но
              в админке и в новых выгрузках старое название останется, пока вы его не замените.
            </p>
          ) : (
            <p className="text-xs text-success font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Старого названия в данных нет
            </p>
          )}
        </div>
      </div>
      {lines.length > 0 && (
        <button
          type="button"
          onClick={() => setIsConfirmOpen(true)}
          className="w-full py-2.5 px-4 neu-button rounded-xl text-xs font-black text-[#4B59BB] cursor-pointer"
        >
          Заменить на «{newName}»
        </button>
      )}
      <ConfirmDialog
        isOpen={isConfirmOpen}
        title={`Заменить MANSTYLE на «${newName}»?`}
        message={`Будут обновлены: ${lines.join('; ')}. Коды промокодов не меняются. Демо-контакты шаблона будут очищены — заполните настоящие.`}
        confirmLabel="Заменить"
        confirmIcon={<Replace className="w-3.5 h-3.5" />}
        tone="neutral"
        onConfirm={handleRename}
        onClose={() => setIsConfirmOpen(false)}
      />
    </div>
  );
};

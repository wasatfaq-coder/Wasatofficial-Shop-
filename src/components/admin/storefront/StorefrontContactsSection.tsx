import React from 'react';
import { Phone, Tag } from 'lucide-react';
import { AdminScheduleEditor } from '../AdminScheduleEditor';
import { AdminHint } from '../AdminHint';
import { NeumorphicSwitch } from '../../NeumorphicSwitch';
import type { StorefrontSectionProps } from './storefrontForm';
import { StorefrontCard, StorefrontTextField } from './StorefrontFields';

interface StorefrontContactsSectionProps extends StorefrontSectionProps {
  /** «Применить» была нажата с ошибкой в графике: ошибки показаны у графика */
  showScheduleErrors: boolean;
}

/** «Контакты и график»: название, контакты, график работы и объявление над шапкой */
export const StorefrontContactsSection: React.FC<StorefrontContactsSectionProps> = ({
  settings,
  patch,
  showScheduleErrors,
}) => {
  const field = { settings, patch };
  return (
    <div className="space-y-4">
      <StorefrontCard
        title="Название и контакты"
        icon={<Phone className="w-3.5 h-3.5 text-accent" aria-hidden="true" />}
        hint="Эти контакты видят покупатели в шапке, подвале и профиле."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StorefrontTextField {...field} name="storeName" label="Название магазина" />
          <StorefrontTextField
            {...field}
            name="storeSlogan"
            label="Слоган"
            placeholder="Одна строка о магазине под названием"
          />
          <StorefrontTextField
            {...field}
            name="phone"
            label="Телефон"
            type="tel"
            autoComplete="tel"
            placeholder="+7 (495) 123-45-67"
          />
          <StorefrontTextField
            {...field}
            name="email"
            label="Почта для покупателей"
            type="email"
            autoComplete="email"
            placeholder="shop@example.com"
          />
          <StorefrontTextField {...field} name="telegram" label="Telegram" placeholder="@ваш_магазин" />
          <StorefrontTextField
            {...field}
            name="whatsapp"
            label="WhatsApp"
            type="tel"
            autoComplete="tel"
            placeholder="+7 (999) 000-00-00"
          />
          <StorefrontTextField
            {...field}
            name="pickupAddress"
            label="Адрес магазина (самовывоз и примерка)"
            autoComplete="street-address"
            className="sm:col-span-2"
          />
        </div>
      </StorefrontCard>

      <section className="neu-inset rounded-2xl sm:rounded-3xl p-4 sm:p-5">
        <AdminScheduleEditor
          schedule={settings.schedule}
          comment={settings.workingHours}
          onChange={(schedule) => patch({ schedule })}
          onCommentChange={(workingHours) => patch({ workingHours })}
          showErrors={showScheduleErrors}
        />
      </section>

      <StorefrontCard title="Объявление в шапке" icon={<Tag className="w-3.5 h-3.5 text-accent" aria-hidden="true" />}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 min-w-0">
            <label htmlFor="storefront-isStoreBannerVisible" className="text-xs font-bold text-[#2D3A4E] cursor-pointer select-none">
              Показывать объявление
            </label>
            <AdminHint label="Показывать объявление">
              Тонкая полоса над шапкой сайта: акция, объявление. Не то же, что «Баннеры».
            </AdminHint>
          </div>
          <NeumorphicSwitch
            id="storefront-isStoreBannerVisible"
            checked={settings.isStoreBannerVisible ?? false}
            onChange={(isStoreBannerVisible) => patch({ isStoreBannerVisible })}
            label="Показывать объявление"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <StorefrontTextField
            {...field}
            name="bannerBadgeText"
            label="Метка"
            placeholder="АКЦИЯ"
            hint="Необязательное короткое слово перед текстом (например: АКЦИЯ, NEW). Пусто — без метки."
          />
          <StorefrontTextField
            {...field}
            name="storeBannerText"
            label="Текст объявления"
            placeholder="Текст в верхней строке сайта"
            className="sm:col-span-3"
          />
        </div>
      </StorefrontCard>
    </div>
  );
};

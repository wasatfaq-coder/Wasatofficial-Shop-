import React from 'react';
import { Building2, CreditCard, FileText } from 'lucide-react';
import type { StorefrontSectionProps } from './storefrontForm';
import { StorefrontCard, StorefrontTextField } from './StorefrontFields';

/** «Реквизиты»: организация, регистрация и банк — для оферты, счетов и окна «Бренд и реквизиты» */
export const StorefrontRequisitesSection: React.FC<StorefrontSectionProps> = ({ settings, patch }) => {
  const field = { settings, patch };
  return (
    <div className="space-y-4">
      <p className="text-xs text-text-secondary">
        Нужны для оферты и счетов. Без них документы покупателям не показываются. Покупатель копирует эти данные для
        счетов и договоров.
      </p>

      <StorefrontCard title="Организация и адрес" icon={<Building2 className="w-3.5 h-3.5 text-accent" aria-hidden="true" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StorefrontTextField
            {...field}
            name="legalEntityName"
            label="Юридическое лицо или ИП"
            placeholder="ООО «Название» или ИП Фамилия И. О."
          />
          <StorefrontTextField {...field} name="ceo" label="Руководитель" placeholder="Фамилия Имя Отчество" />
          <StorefrontTextField
            {...field}
            name="legalAddress"
            label="Юридический адрес"
            autoComplete="street-address"
            placeholder="Индекс, город, улица, дом, офис"
          />
          <StorefrontTextField
            {...field}
            name="edo"
            label="Электронный документооборот (ЭДО)"
            placeholder="Оператор и идентификатор, например: Диадок"
          />
        </div>
      </StorefrontCard>

      <StorefrontCard title="Регистрация (ФНС)" icon={<FileText className="w-3.5 h-3.5 text-accent" aria-hidden="true" />}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StorefrontTextField {...field} name="inn" label="ИНН" mono placeholder="10 или 12 цифр" />
          <StorefrontTextField {...field} name="kpp" label="КПП" mono placeholder="9 цифр" />
          <StorefrontTextField {...field} name="ogrn" label="ОГРН / ОГРНИП" mono placeholder="13 или 15 цифр" />
        </div>
      </StorefrontCard>

      <StorefrontCard title="Банк и расчёты" icon={<CreditCard className="w-3.5 h-3.5 text-accent" aria-hidden="true" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StorefrontTextField {...field} name="bankName" label="Банк" placeholder="Название банка и город" />
          <StorefrontTextField {...field} name="bik" label="БИК банка" mono placeholder="9 цифр" />
          <StorefrontTextField {...field} name="checkingAccount" label="Расчётный счёт" mono placeholder="20 цифр" />
          <StorefrontTextField {...field} name="corrAccount" label="Корреспондентский счёт" mono placeholder="20 цифр" />
        </div>
      </StorefrontCard>
    </div>
  );
};

import React, { useState } from 'react';
import { Check, ChevronDown, Copy, MapPin, UserRound } from 'lucide-react';
import type { Order } from '../../types';
import { copyToClipboard } from '../../utils/clipboard';
import { formatAddress } from '../../utils/addressFormat';
import { fullName, type AddressParts } from '../../shared/personName';

/** One labelled value with its own copy button and a short «Скопировано» */
const CopyRow: React.FC<{ label: string; value?: string; strong?: boolean }> = ({ label, value, strong }) => {
  const [copied, setCopied] = useState(false);
  if (!value?.trim()) return null;
  const copy = async () => {
    if (await copyToClipboard(value.trim())) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="min-w-0 flex-1">
        <span className="block text-[11px] text-[#4E5C70]">{label}</span>
        <span className={`block text-xs text-[#2D3A4E] break-words ${strong ? 'font-extrabold' : 'font-bold'}`}>{value}</span>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={`Скопировать: ${label}`}
        className="w-8 h-8 rounded-lg neu-button flex items-center justify-center text-accent shrink-0 cursor-pointer"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-success" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
      </button>
      <span className="sr-only" aria-live="polite">{copied ? 'Скопировано' : ''}</span>
      {copied && <span className="text-[11px] font-bold text-success shrink-0" aria-hidden="true">Скопировано</span>}
    </div>
  );
};

const ADDRESS_ROWS: [keyof AddressParts, string][] = [
  ['region', 'Страна / регион'],
  ['city', 'Город / населённый пункт'],
  ['street', 'Улица'],
  ['house', 'Дом'],
  ['building', 'Корпус / строение'],
  ['entrance', 'Подъезд'],
  ['floor', 'Этаж'],
  ['intercom', 'Домофон'],
  ['apartment', 'Квартира / офис'],
  ['postalCode', 'Почтовый индекс'],
  ['comment', 'Комментарий курьеру'],
];

/**
 * «ФИО клиента» and «Адрес доставки» of an order, each field with a copy button (owner's request 02.10): the
 * owner fills in carrier forms (СДЭК, Почта) field by field. Orders placed before the three name fields keep only the
 * full name and the address line — parts are not guessed.
 */
export const AdminOrderCopyCards: React.FC<{ order: Order }> = ({ order }) => {
  const [open, setOpen] = useState(false);
  const nameParts = {
    lastName: order.customerLastName,
    firstName: order.customerFirstName,
    middleName: order.customerMiddleName,
  };
  const name = fullName(nameParts) || order.customerName || '';
  const address = order.deliveryAddressParts;
  const fullAddress = address ? formatAddress(address) : order.deliveryAddress || '';
  if (!name && !fullAddress) return null;
  const panelId = `order-copy-${order.id}`;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full min-h-8 px-2.5 rounded-xl neu-button text-[11px] font-bold text-[#2D3A4E] hover:text-accent flex items-center justify-between gap-2 cursor-pointer"
      >
        <span>ФИО и адрес для отправки</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div id={panelId} className="space-y-2">
          <section className="neu-flat-sm rounded-xl p-2.5 space-y-2" aria-label="ФИО клиента">
            <h5 className="text-[11px] font-extrabold uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1">
              <UserRound className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
              ФИО клиента
            </h5>
            <CopyRow label="Фамилия" value={nameParts.lastName} />
            <CopyRow label="Имя" value={nameParts.firstName} />
            <CopyRow label="Отчество" value={nameParts.middleName} />
            <CopyRow label="Полное ФИО" value={name} strong />
          </section>
          {fullAddress && (
            <section className="neu-flat-sm rounded-xl p-2.5 space-y-2" aria-label="Адрес доставки">
              <h5 className="text-[11px] font-extrabold uppercase tracking-wider text-[#2D3A4E] flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                Адрес доставки
              </h5>
              {address && ADDRESS_ROWS.map(([key, label]) => <CopyRow key={key} label={label} value={address[key]} />)}
              <CopyRow label="Полный адрес" value={fullAddress} strong />
            </section>
          )}
        </div>
      )}
    </div>
  );
};

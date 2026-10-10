// Реквизиты оплаты заказа и чек («Доработки 5», бриф владельца 02.10): поля и проверки по типам оплаты, копирование
// только цифр, какие способы видит покупатель, причины отклонения чека, требования к фото чека.
import type {
  Order,
  OrderPaymentDetails,
  PaymentKind,
  PaymentLogEntry,
  PaymentRequisitesByKind,
} from '../types';

export const PAYMENT_KINDS: PaymentKind[] = ['sbp', 'card', 'account'];

export const PAYMENT_KIND_TITLES: Record<PaymentKind, string> = {
  sbp: 'Онлайн по телефону (СБП)',
  card: 'Перевод на карту',
  account: 'Расчётный счёт',
};

/** Short names for chips and lists */
export const PAYMENT_KIND_SHORT: Record<PaymentKind, string> = {
  sbp: 'СБП',
  card: 'Карта',
  account: 'Счёт',
};

type FieldFormat = 'phone' | 'card' | 'digits' | 'text';

export interface RequisiteField {
  /** Key in `PaymentRequisitesByKind[kind]` */
  key: string;
  label: string;
  format: FieldFormat;
  /** Number of digits («digits» format) */
  digits?: number[];
  optional?: boolean;
  placeholder?: string;
  maxLength?: number;
}

export const REQUISITE_FIELDS: Record<PaymentKind, RequisiteField[]> = {
  sbp: [
    { key: 'phone', label: 'Номер телефона', format: 'phone', placeholder: '+7 (999) 000-00-00' },
    { key: 'bank', label: 'Банк получателя', format: 'text', maxLength: 80 },
    { key: 'holder', label: 'ФИО получателя', format: 'text', maxLength: 120 },
  ],
  card: [
    { key: 'cardNumber', label: 'Номер карты', format: 'card', placeholder: '0000 0000 0000 0000' },
    { key: 'bank', label: 'Название банка', format: 'text', maxLength: 80 },
    { key: 'holder', label: 'ФИО получателя', format: 'text', maxLength: 120 },
  ],
  account: [
    { key: 'orgName', label: 'Организация / ФИО ИП', format: 'text', maxLength: 160 },
    { key: 'account', label: 'Расчётный счёт', format: 'digits', digits: [20] },
    { key: 'inn', label: 'ИНН', format: 'digits', digits: [10, 12] },
    { key: 'kpp', label: 'КПП', format: 'digits', digits: [9], optional: true },
    { key: 'bik', label: 'БИК банка', format: 'digits', digits: [9] },
    { key: 'corrAccount', label: 'Корр. счёт', format: 'digits', digits: [20] },
    { key: 'bank', label: 'Банк', format: 'text', optional: true, maxLength: 120 },
  ],
};

export const onlyDigits = (value: string): string => (value || '').replace(/\D/g, '');

/** Phone digits «79991234567»: 8… and 10 digits become 7… */
export function phoneDigits(value: string): string {
  let d = onlyDigits(value);
  if (d.length === 10) d = `7${d}`;
  if (d.length === 11 && d.startsWith('8')) d = `7${d.slice(1)}`;
  return d.slice(0, 11);
}

/** «+7 (999) 000-00-00» while typing and for display */
export function formatPhone(value: string): string {
  const d = phoneDigits(value);
  if (!d) return '';
  const rest = d.startsWith('7') ? d.slice(1) : d;
  let out = '+7';
  if (rest.length > 0) out += ` (${rest.slice(0, 3)}`;
  if (rest.length >= 3) out += ')';
  if (rest.length > 3) out += ` ${rest.slice(3, 6)}`;
  if (rest.length > 6) out += `-${rest.slice(6, 8)}`;
  if (rest.length > 8) out += `-${rest.slice(8, 10)}`;
  return out;
}

/** Card number in groups of 4: «2202 2000 0000 0000» */
export function formatCard(value: string): string {
  return onlyDigits(value).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** What the field shows: numbers with their mask, text as is */
export function displayValue(field: RequisiteField, value: string | undefined): string {
  const v = value ?? '';
  if (field.format === 'phone') return formatPhone(v);
  if (field.format === 'card') return formatCard(v);
  return v;
}

/** What «Скопировать» puts on the clipboard: numbers — digits only, without spaces and signs (brief §5.1) */
export function copyValue(field: RequisiteField, value: string | undefined): string {
  const v = value ?? '';
  return field.format === 'text' ? v.trim() : onlyDigits(v);
}

/** What is stored: digits for numbers, trimmed text */
export function normalizeField(field: RequisiteField, value: string | undefined): string {
  const v = value ?? '';
  if (field.format === 'phone') return phoneDigits(v);
  if (field.format === 'card') return onlyDigits(v).slice(0, 19);
  if (field.format === 'digits') return onlyDigits(v).slice(0, Math.max(...(field.digits ?? [40])));
  return v.trim().slice(0, field.maxLength ?? 200);
}

export function emptyRequisites<K extends PaymentKind>(kind: K): PaymentRequisitesByKind[K] {
  const out: Record<string, string> = {};
  for (const f of REQUISITE_FIELDS[kind]) out[f.key] = '';
  return out as unknown as PaymentRequisitesByKind[K];
}

/** Stored requisites (digits) as the form shows them: with their masks */
export function toFormRequisites<K extends PaymentKind>(kind: K, fields: PaymentRequisitesByKind[K] | undefined): PaymentRequisitesByKind[K] {
  const source = (fields ?? {}) as unknown as Record<string, string | undefined>;
  const out: Record<string, string> = {};
  for (const f of REQUISITE_FIELDS[kind]) out[f.key] = displayValue(f, source[f.key]);
  return out as unknown as PaymentRequisitesByKind[K];
}

export function normalizeRequisites<K extends PaymentKind>(kind: K, fields: PaymentRequisitesByKind[K]): PaymentRequisitesByKind[K] {
  const source = fields as unknown as Record<string, string | undefined>;
  const out: Record<string, string> = {};
  for (const f of REQUISITE_FIELDS[kind]) {
    const v = normalizeField(f, source[f.key]);
    if (v || !f.optional) out[f.key] = v;
  }
  return out as unknown as PaymentRequisitesByKind[K];
}

/** Errors by field key; empty — the requisites are valid (lengths by the brief: р/с and к/с 20, БИК and КПП 9, ИНН 10/12) */
export function validateRequisites<K extends PaymentKind>(kind: K, fields: PaymentRequisitesByKind[K]): Record<string, string> {
  const source = fields as unknown as Record<string, string | undefined>;
  const errors: Record<string, string> = {};
  for (const f of REQUISITE_FIELDS[kind]) {
    const raw = (source[f.key] ?? '').trim();
    const optional = f.optional && !(kind === 'account' && f.key === 'kpp' && onlyDigits(source.inn ?? '').length === 10);
    if (!raw) {
      if (!optional) errors[f.key] = kind === 'account' && f.key === 'kpp' ? 'КПП обязателен для организации (ИНН из 10 цифр)' : 'Заполните поле';
      continue;
    }
    if (f.format === 'phone') {
      const d = phoneDigits(raw);
      if (d.length !== 11 || !d.startsWith('7')) errors[f.key] = 'Номер в формате +7 (999) 000-00-00';
    } else if (f.format === 'card') {
      const n = onlyDigits(raw).length;
      if (n < 16 || n > 19) errors[f.key] = 'Номер карты — от 16 до 19 цифр';
    } else if (f.format === 'digits') {
      const n = onlyDigits(raw).length;
      const allowed = f.digits ?? [];
      if (/[^\d\s]/.test(raw) || !allowed.includes(n)) {
        errors[f.key] = `${f.label} — ${allowed.join(' или ')} цифр`;
      }
    }
  }
  return errors;
}

export const isValidRequisites = <K extends PaymentKind>(kind: K, fields: PaymentRequisitesByKind[K] | undefined): boolean =>
  Boolean(fields) && Object.keys(validateRequisites(kind, fields as PaymentRequisitesByKind[K])).length === 0;

/** The ways the buyer sees: only those the admin filled for the order (brief §5.2) */
export function filledPaymentKinds(details: OrderPaymentDetails | undefined): PaymentKind[] {
  if (!details) return [];
  return PAYMENT_KINDS.filter((kind) => isValidRequisites(kind, details[kind] as PaymentRequisitesByKind[typeof kind] | undefined));
}

/** Labels of the payment status, the same in every section */
export const PAYMENT_STATUS_LABELS: Record<NonNullable<Order['paymentStatus']>, string> = {
  pending: 'Ожидает оплаты',
  receipt_review: 'Чек на проверке',
  paid: 'Оплачен',
  paid_on_delivery: 'Оплата при получении',
  refunded: 'Возврат средств',
};

/**
 * «Выбрать способ оплаты» in the buyer's order: own order (sign-in with Google — the rule checks the uid), not cancelled,
 * waiting for payment, with requisites the admin applied. A guest asks the store in the chat.
 */
export function canPayByRequisites(order: Order, uid: string | undefined): boolean {
  return Boolean(uid)
    && order.customerUid === uid
    && !order.isCancelled
    && (order.paymentStatus ?? 'pending') === 'pending'
    && filledPaymentKinds(order.paymentDetails).length > 0;
}

/** Waits for the store: requisites not applied yet, or the receipt is being checked */
export function paymentHint(order: Order, uid: string | undefined): string | null {
  if (order.isCancelled) return null;
  const status = order.paymentStatus ?? 'pending';
  if (status === 'receipt_review') return 'Чек на проверке: магазин сверит поступление и подтвердит оплату.';
  if (status !== 'pending') return null;
  if (!uid || order.customerUid !== uid) return 'Реквизиты для оплаты магазин пришлёт в чате.';
  if (filledPaymentKinds(order.paymentDetails).length === 0) return 'Магазин ещё не указал реквизиты для оплаты этого заказа. Они появятся здесь — или спросите в чате.';
  return null;
}

export const RECEIPT_REJECT_REASONS = [
  'Не поступили средства',
  'Неразборчивый чек',
  'Сумма не совпадает с заказом',
  'Чек от другого заказа',
];
export const OTHER_REJECT_REASON = 'Другая причина';

/** Photo of the receipt: jpg/png up to 15 MB before compression (PDF needs Firebase Storage — owner's decision 02.10) */
export const RECEIPT_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const RECEIPT_ACCEPT = 'image/jpeg,image/png,.jpg,.jpeg,.png';

export function receiptFileError(file: Pick<File, 'type' | 'name' | 'size'>): string | null {
  const name = file.name.toLowerCase();
  const typeOk = file.type === 'image/jpeg' || file.type === 'image/png' || /\.(jpe?g|png)$/.test(name);
  if (!typeOk) return 'Подходит фото чека в формате JPG или PNG';
  if (file.size > RECEIPT_MAX_FILE_BYTES) return 'Файл больше 15 МБ — сделайте снимок экрана с чеком';
  return null;
}

/** Text of the chat message with the receipt (brief §4) */
export const receiptMessageText = (orderId: string, kind: PaymentKind): string =>
  `Клиент прикрепил подтверждение оплаты к заказу № ${orderId} (${PAYMENT_KIND_TITLES[kind]})`;

export function paymentLogEntry(
  event: PaymentLogEntry['event'],
  by: PaymentLogEntry['by'],
  extra: { byUid?: string; note?: string; at?: Date } = {}
): PaymentLogEntry {
  return {
    event,
    at: (extra.at ?? new Date()).toISOString(),
    by,
    ...(extra.byUid ? { byUid: extra.byUid } : {}),
    ...(extra.note ? { note: extra.note } : {}),
  };
}

/** A receipt is waiting for the admin: the pulsing badge in «Заказы» and in the chat */
export const isReceiptOnReview = (order: Pick<Order, 'paymentStatus' | 'isCancelled'>): boolean =>
  !order.isCancelled && order.paymentStatus === 'receipt_review';

export type ReceiptDecision = 'confirm' | 'reject';

/**
 * The admin's check of a receipt (brief §4): «Подтвердить оплату» → «Оплачен»; «Отклонить чек» → «Ожидает оплаты» with
 * the reason the buyer sees until a new receipt. Both go to the payment history with the time and the admin.
 */
export function reviewedOrder(
  order: Order,
  decision: ReceiptDecision,
  options: { adminUid?: string; reason?: string; at?: Date } = {}
): Order {
  const entry = paymentLogEntry(decision === 'confirm' ? 'confirmed' : 'rejected', 'admin', {
    byUid: options.adminUid,
    note: decision === 'reject' ? options.reason : undefined,
    at: options.at,
  });
  const { paymentRejectReason: _previous, ...rest } = order;
  return {
    ...rest,
    paymentStatus: decision === 'confirm' ? 'paid' : 'pending',
    ...(decision === 'reject' && options.reason ? { paymentRejectReason: options.reason } : {}),
    paymentLog: [...(order.paymentLog ?? []), entry],
  };
}

/** The store's answer in the order's chat after the check */
export const receiptReviewMessage = (orderId: string, decision: ReceiptDecision, reason?: string): string =>
  decision === 'confirm'
    ? `Оплата заказа № ${orderId} подтверждена. Спасибо!`
    : `Чек к заказу № ${orderId} отклонён: ${reason || 'причина не указана'}. Проверьте оплату и отправьте новый чек в заказе (Профиль → заказ → «Выбрать способ оплаты»).`;

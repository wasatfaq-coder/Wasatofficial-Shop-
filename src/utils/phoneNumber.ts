/**
 * The phone of «Заказ в 1 клик» (audit 07.10, finding 17): the window puts «+7» in front, and the manager can reach the
 * buyer only by this number. Before, the length of the text was checked — spaces counted, and 8 digits passed.
 */

/** A Russian number has this many digits after «+7» */
export const PHONE_DIGITS_AFTER_CODE = 10;

/** Digits typed after the leading «+7» (all digits when the number does not start with it) */
export function digitsAfterCountryCode(phone: string): number {
  const digits = phone.replace(/\D/g, '').length;
  return phone.trim().startsWith('+7') ? Math.max(0, digits - 1) : digits;
}

export function isQuickOrderPhoneComplete(phone: string): boolean {
  return digitsAfterCountryCode(phone) >= PHONE_DIGITS_AFTER_CODE;
}

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
  return digitsAfterCountryCode(phone) === PHONE_DIGITS_AFTER_CODE;
}

/**
 * The field's text as «+7 XXX XXX-XX-XX» (audit 29.10, finding 18): a number typed, pasted or autofilled with the
 * leading 8 or 7 («89001234567», «8 (900) …») used to become «+7 89001234567» and pass — the manager could not call
 * back. The 8 or 7 of an 11-digit number is the country code; more than 10 digits are cut.
 */
export function formatQuickOrderPhone(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (input.trim().startsWith('+7')) digits = digits.slice(1);
  if (digits.length === 11 && (digits[0] === '8' || digits[0] === '7')) digits = digits.slice(1);
  digits = digits.slice(0, PHONE_DIGITS_AFTER_CODE);
  const [code, first, second, third] = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 8), digits.slice(8, 10)];
  return `+7 ${code}${first ? ` ${first}` : ''}${second ? `-${second}` : ''}${third ? `-${third}` : ''}`;
}

/** Russian plural form: pluralRu(3, ['день', 'дня', 'дней']) → 'дня' */
export function pluralRu(n: number, forms: [one: string, few: string, many: string]): string {
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/** «1 день», «3 дня», «14 дней» */
export function formatDays(n: number): string {
  return `${n} ${pluralRu(n, ['день', 'дня', 'дней'])}`;
}

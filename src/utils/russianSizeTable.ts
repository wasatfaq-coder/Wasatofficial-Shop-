/** Men's sizes: Russian, international and body measurements (ГОСТ 31399-2009); the size guide and the catalog filter */
export interface RussianSizeTableRow {
  ru: number;
  int: string;
  chest: string;
  waist: string;
  hips: string;
  jeans: string;
}

export const RUSSIAN_SIZE_TABLE_ROWS: RussianSizeTableRow[] = [
  { ru: 44, int: 'XS', chest: '86–89', waist: '74–77', hips: '92–95', jeans: 'W29–W30' },
  { ru: 46, int: 'S', chest: '90–93', waist: '78–81', hips: '96–99', jeans: 'W30–W31' },
  { ru: 48, int: 'M', chest: '94–97', waist: '82–85', hips: '100–103', jeans: 'W32' },
  { ru: 50, int: 'L', chest: '98–101', waist: '86–89', hips: '104–107', jeans: 'W33–W34' },
  { ru: 52, int: 'XL', chest: '102–105', waist: '90–95', hips: '108–111', jeans: 'W35–W36' },
  { ru: 54, int: '2XL', chest: '106–109', waist: '96–101', hips: '112–115', jeans: 'W38' },
  { ru: 56, int: '3XL', chest: '110–113', waist: '102–107', hips: '116–119', jeans: 'W40' },
  { ru: 58, int: '4XL', chest: '114–117', waist: '108–113', hips: '120–123', jeans: 'W42' },
  { ru: 60, int: '5XL', chest: '118–122', waist: '114–119', hips: '124–127', jeans: 'W44' },
];

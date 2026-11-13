export function validCheckDigit(code: string) {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  let sum = 0;
  for (let i = code.length - 2, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3)
    sum += Number(code[i]) * weight;
  return (10 - (sum % 10)) % 10 === Number(code.at(-1));
}

export function normalizeBarcode(value: string, format = '') {
  let code = value.trim();
  if (/UPC.?E/i.test(format)) {
    if (!/^[01]\d{7}$/.test(code)) return null;
    const [ns = '', a = '', b = '', c = '', d = '', e = '', f = '', check = ''] = code;
    if ('012'.includes(f)) code = ns + a + b + f + '0000' + c + d + e + check;
    else if (f === '3') code = ns + a + b + c + '00000' + d + e + check;
    else if (f === '4') code = ns + a + b + c + d + '00000' + e + check;
    else code = ns + a + b + c + d + e + '0000' + f + check;
  }
  if (!validCheckDigit(code)) return null;
  return code.length === 12 ? '0' + code : code;
}

export function createBarcodeStabilizer(requiredReads = 2) {
  let last = '';
  let reads = 0;
  let lastTime = 0;
  return (value: string, format = '', time = Date.now()) => {
    const code = normalizeBarcode(value, format);
    if (!code) {
      reads = 0;
      last = '';
      return null;
    }
    reads = code === last && time - lastTime < 1500 ? reads + 1 : 1;
    last = code;
    lastTime = time;
    return reads >= requiredReads ? code : null;
  };
}

export function parseNutritionLabel(text: string) {
  const fields: Partial<
    Record<
      | 'caloriesKcal'
      | 'proteinG'
      | 'carbohydrateG'
      | 'fatG'
      | 'fiberG'
      | 'sugarG'
      | 'sodiumMg'
      | 'defaultServingGrams',
      number
    >
  > = {};
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const patterns = [
    [
      'caloriesKcal',
      /^(?:energy\s*\(kcal\)|calories|energy)\b/i,
      /(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:kcal)?(?:\s|$)/i,
    ],
    ['proteinG', /^protein\b/i, /(\d+(?:[.,]\d+)?)\s*g\b/i],
    ['carbohydrateG', /^(?:total\s+)?carbohydrates?\b/i, /(\d+(?:[.,]\d+)?)\s*g\b/i],
    ['fatG', /^(?:total\s+)?fat\b/i, /(\d+(?:[.,]\d+)?)\s*g\b/i],
    ['fiberG', /^(?:dietary\s+)?fib(?:er|re)\b/i, /(\d+(?:[.,]\d+)?)\s*g\b/i],
    ['sugarG', /^(?:total\s+)?sugars?\b/i, /(\d+(?:[.,]\d+)?)\s*g\b/i],
    ['sodiumMg', /^sodium\b/i, /(\d+(?:[.,]\d+)?)\s*mg\b/i],
  ] as const;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';
    for (const [key, label, value] of patterns) {
      if (!label.test(line) || /calories\s+from\s+fat/i.test(line)) continue;
      const rest = line.replace(label, '').trim();
      const candidate = /\d/.test(rest) ? rest : lines[i + 1] || '';
      const withoutPercentages = candidate.replace(/\d+(?:[.,]\d+)?\s*%/g, '');
      if ((withoutPercentages.match(/\d+(?:[.,]\d+)?/g) || []).length > 1) continue;
      // Multiple columns need manual interpretation; never choose a column silently.
      if ((candidate.match(/\d+(?:[.,]\d+)?\s*(?:g|mg|kcal)\b/g) || []).length > 1) continue;
      const match = candidate.match(value);
      if (match?.[1]) fields[key] = Number(match[1].replace(',', '.'));
    }
    const serving = line.match(/serving\s*size.*?(\d+(?:\.\d+)?)\s*g\b/i);
    if (serving?.[1]) fields.defaultServingGrams = Number(serving[1]);
  }
  return {
    fields,
    basis:
      /per\s*100\s*g/i.test(text) && !/per\s*serving/i.test(text)
        ? ('per_100g' as const)
        : ('per_serving' as const),
  };
}

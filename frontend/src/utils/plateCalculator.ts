export const PLATE_WEIGHTS = [20, 10, 5, 2.5, 1.25] as const;
export function calculatePlates(totalKg: number) {
  if (!Number.isFinite(totalKg) || totalKg < 20 || totalKg > 1000) {
    return {
      error: 'Enter a total load between 20 and 1,000 kg, including the 20 kg bar.',
      plates: [],
    };
  }
  const grams = Math.round(totalKg * 1000);
  if (Math.abs(grams / 1000 - totalKg) > 1e-8 || (grams - 20000) % 2500 !== 0) {
    return {
      error:
        'These plates support totals in 2.5 kg steps. Choose an exact total such as 60 or 62.5 kg.',
      plates: [],
    };
  }
  let perSide = (grams - 20000) / 2;
  const plates = PLATE_WEIGHTS.map((weightKg) => {
    const count = Math.floor(perSide / (weightKg * 1000));
    perSide -= count * weightKg * 1000;
    return { weightKg, count };
  }).filter((plate) => plate.count > 0);
  return { error: '', plates };
}

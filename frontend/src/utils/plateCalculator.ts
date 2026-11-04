export const PLATE_WEIGHTS = [20, 10, 5, 2.5, 1.25] as const;
export const POUND_PLATE_WEIGHTS = [45, 25, 10, 5, 2.5] as const;
export function calculatePlateLoad(total: number, unit: 'kg' | 'lb') {
  const bar = unit === 'lb' ? 45 : 20;
  const max = unit === 'lb' ? 2200 : 1000;
  const step = unit === 'lb' ? 5 : 2.5;
  if (!Number.isFinite(total) || total < bar || total > max) {
    return {
      error: `Enter a total load between ${bar} and ${max.toLocaleString('en-US')} ${unit}, including the ${bar} ${unit} bar.`,
      plates: [],
    };
  }
  const scaled = Math.round(total * 1000);
  if (Math.abs(scaled / 1000 - total) > 1e-8 || (scaled - bar * 1000) % (step * 1000) !== 0) {
    return {
      error: `These plates support totals in ${step} ${unit} steps. Choose an exact total such as ${unit === 'lb' ? '135 or 140 lb' : '60 or 62.5 kg'}.`,
      plates: [],
    };
  }
  let perSide = (scaled - bar * 1000) / 2;
  const sizes = unit === 'lb' ? POUND_PLATE_WEIGHTS : PLATE_WEIGHTS;
  const plates = sizes
    .map((weight) => {
      const count = Math.floor(perSide / (weight * 1000));
      perSide -= count * weight * 1000;
      return { weight, count };
    })
    .filter((plate) => plate.count > 0);
  return { error: '', plates };
}

export function calculatePlates(totalKg: number) {
  const result = calculatePlateLoad(totalKg, 'kg');
  return {
    error: result.error,
    plates: result.plates.map(({ weight, count }) => ({ weightKg: weight, count })),
  };
}

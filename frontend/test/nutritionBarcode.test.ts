import { describe, it, expect } from 'vitest';
import {
  normalizeBarcode,
  createBarcodeStabilizer,
  parseNutritionLabel,
} from '../src/utils/nutritionBarcode';

describe('nutrition scanner', () => {
  it('validates Philippine and imported barcodes and gives UPC-A one EAN key', () => {
    expect(normalizeBarcode('4807770273698')).toBe('4807770273698');
    expect(normalizeBarcode('4807770273699')).toBeNull();
    expect(normalizeBarcode('036000291452')).toBe('0036000291452');
    expect(normalizeBarcode('0036000291452')).toBe('0036000291452');
    expect(normalizeBarcode('04252614', 'UPC_E')).toBe('0042100005264');
    expect(normalizeBarcode('96385074')).toBe('96385074');
  });
  it('accepts two stable valid reads and ignores noisy or expired reads', () => {
    const read = createBarcodeStabilizer();
    expect(read('4807770273698', '', 0)).toBeNull();
    expect(read('4807770273698', '', 100)).toBe('4807770273698');
    expect(read('4807770273699', '', 200)).toBeNull();
    expect(read('4807770273698', '', 300)).toBeNull();
    expect(read('4807770273698', '', 3000)).toBeNull();
  });
  it('extracts label candidates without inventing missing values or mixing columns', () => {
    const label = parseNutritionLabel(
      'Nutrition Facts\nServing size 40 g\nCalories 160\nTotal Fat 5 g 6%\nProtein 3g\nTotal Carbohydrate 26g\nSodium 120 mg\nDietary Fiber 2g\nTotal Sugars 4g',
    );
    expect(label.basis).toBe('per_serving');
    expect(label.fields).toMatchObject({
      caloriesKcal: 160,
      fatG: 5,
      proteinG: 3,
      carbohydrateG: 26,
      sodiumMg: 120,
      defaultServingGrams: 40,
    });
    expect(parseNutritionLabel('Protein 3g 6g').fields.proteinG).toBeUndefined();
    expect(parseNutritionLabel('Calories 160 320').fields.caloriesKcal).toBeUndefined();
    expect(parseNutritionLabel('Total Fat 2g').fields.proteinG).toBeUndefined();
  });
});

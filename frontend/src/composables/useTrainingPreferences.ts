import { computed, ref } from 'vue';

export interface TrainingPreferences {
  massUnit: 'kg' | 'lb';
  incrementKg: number;
  repMin: number;
  repMax: number;
  goal: 'strength' | 'muscle' | 'fitness';
  equipment: 'gym' | 'dumbbells' | 'bodyweight';
  trainingDays: number[];
  sessionMinutes: number;
  onboardingComplete: boolean;
}
export const defaultPreferences: TrainingPreferences = {
  massUnit: 'kg',
  incrementKg: 2.5,
  repMin: 8,
  repMax: 12,
  goal: 'muscle',
  equipment: 'gym',
  trainingDays: [0, 2, 4],
  sessionMinutes: 45,
  onboardingComplete: false,
};
const preferences = ref<TrainingPreferences>({ ...defaultPreferences });
export function setTrainingPreferences(value?: Partial<TrainingPreferences>) {
  preferences.value = { ...defaultPreferences, ...value };
}
export function useTrainingPreferences() {
  const massUnit = computed(() => preferences.value.massUnit);
  const toDisplay = (kg: number | null | undefined) =>
    kg == null ? null : Math.round(kg * (massUnit.value === 'lb' ? 2.2046226218 : 1) * 100) / 100;
  const fromDisplay = (value: string | number | null) =>
    value === '' || value == null
      ? null
      : Math.round((Number(value) / (massUnit.value === 'lb' ? 2.2046226218 : 1)) * 1e6) / 1e6;
  const formatLoad = (kg: number | null | undefined) =>
    kg == null ? '—' : `${toDisplay(kg)} ${massUnit.value}`;
  return { preferences, massUnit, toDisplay, fromDisplay, formatLoad };
}

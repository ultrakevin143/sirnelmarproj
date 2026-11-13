<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import axios from 'axios';
import { Capacitor } from '@capacitor/core';
import {
  normalizeBarcode,
  createBarcodeStabilizer,
  parseNutritionLabel,
} from '../utils/nutritionBarcode';

type MacroKey = 'caloriesKcal' | 'proteinG' | 'carbohydrateG' | 'fatG' | 'fiberG';
type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
type FoodSource = {
  id: number;
  name: string;
  category: string | null;
  source: string;
  sourceRelease: string;
  nutrientsPer100g: Record<MacroKey, number | null>;
  portions: Array<{ name: string; grams: number }>;
  isCustom: boolean;
  basis?: 'per_100g' | 'per_serving';
  nutrients?: Record<MacroKey, number | null>;
  barcode?: string | null;
  details?: {
    confidence?: string;
    needsReview?: boolean;
    reviewReason?: string;
    notes?: string;
    sourceUrl?: string;
    retrievedAt?: string;
    servingSizeText?: string;
    brand?: string;
    sugarG?: number | null;
    sodiumMg?: number | null;
    attribution?: string;
  };
};
type Goals = Record<MacroKey | 'waterMl', number | null>;
type FoodEntry = {
  id: number;
  foodId: number | null;
  foodName: string;
  source: string;
  localDate: string;
  loggedAt: string;
  mealType: MealType;
  amountGrams: number;
  caloriesKcal: number;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  fiberG: number | null;
  hasPhoto?: boolean;
  photoData?: string;
  amountServings?: number | null;
};
type WaterEntry = { id: number; amountMl: number; localDate: string; loggedAt: string };
type DayData = {
  date: string;
  entries: FoodEntry[];
  totals: {
    caloriesKcal: number;
    proteinG: number | null;
    carbohydrateG: number | null;
    fatG: number | null;
    fiberG: number | null;
  };
  goals: Goals | null;
  waterEntries: WaterEntry[];
  waterTotalMl: number;
};

const mealTypes: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const macroCards: Array<{ key: MacroKey; label: string; short: string }> = [
  { key: 'proteinG', label: 'Protein', short: 'PROTEIN' },
  { key: 'carbohydrateG', label: 'Carbs', short: 'CARBS' },
  { key: 'fatG', label: 'Fat', short: 'FAT' },
  { key: 'fiberG', label: 'Fiber', short: 'FIBER' },
];

function localDateToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function newRequestKey() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `nutrition-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function nullableNumber(value: number | string | null) {
  return value == null || (typeof value === 'string' && value.trim() === '') ? null : Number(value);
}

const selectedDate = ref(localDateToday());
const dayData = ref<DayData | null>(null);
const foods = ref<FoodSource[]>([]);
const foodQuery = ref('adobo');
const activeMeal = ref<MealType>('Breakfast');
const isAndroid = Capacitor.getPlatform() === 'android';
const dayLoading = ref(false);
const foodsLoading = ref(false);
const saving = ref(false);
const barcodeBusy = ref(false);
const barcodeError = ref('');
const barcodeScanActive = ref(false);
const mealPhoto = ref('');
const stagedMealPhoto = ref('');
const mealPhotoError = ref('');
const cameraPhotoInput = ref<HTMLInputElement | null>(null);
const galleryPhotoInput = ref<HTMLInputElement | null>(null);
const pageError = ref('');
const pageMessage = ref('');
const foodError = ref('');
const foodDialogError = ref('');
const foodRetryPending = ref(false);
const goalsError = ref('');
const foodDialog = ref(false);
const goalsDialog = ref(false);
const customFoodDialog = ref(false);
const manualBarcodeDialog = ref(false);
const manualBarcode = ref('');
const manualBarcodeFormat = ref('');
const torchAvailable = ref(false);
const torchEnabled = ref(false);
const mealPhotoPicking = ref(false);
const labelPhoto = ref('');
const labelText = ref('');
const labelBusy = ref(false);
const labelConfirmed = ref(false);
const labelMode = ref(false);
const selectedFood = ref<FoodSource | null>(null);
const amountGrams = ref<number | null>(100);
const pendingFoodKey = ref('');
const pendingWaterKeys = new Map<string, string>();
const goalDraft = reactive<Record<MacroKey | 'waterMl', number | string | null>>({
  caloriesKcal: null,
  proteinG: null,
  carbohydrateG: null,
  fatG: null,
  fiberG: null,
  waterMl: null,
});
const customFoodDraft = reactive({
  name: '',
  barcode: '',
  brand: '',
  basis: 'per_100g',
  servingSizeText: '',
  sugarG: null as number | string | null,
  sodiumMg: null as number | string | null,
  caloriesKcal: null as number | string | null,
  proteinG: null as number | string | null,
  carbohydrateG: null as number | string | null,
  fatG: null as number | string | null,
  fiberG: null as number | string | null,
  defaultServingGrams: null as number | string | null,
});
watch(
  customFoodDraft,
  () => {
    labelConfirmed.value = false;
  },
  { deep: true },
);
const customUnit = computed(() =>
  customFoodDraft.basis === 'per_serving' ? 'per serving' : 'per 100 g',
);
const customQualityWarning = computed(() => {
  const values = [
    customFoodDraft.caloriesKcal,
    customFoodDraft.proteinG,
    customFoodDraft.carbohydrateG,
    customFoodDraft.fatG,
  ].map(nullableNumber);
  if (values.some((value) => value == null))
    return 'Some macros are unknown. Daily macro totals will show as incomplete.';
  const [kcal = 0, p = 0, c = 0, f = 0] = values as number[];
  return Math.abs(4 * p + 4 * c + 9 * f - kcal) > Math.max(2, kcal * 0.1)
    ? 'Calories and macros differ by more than 10%. Recheck the label; this food will be flagged for review.'
    : '';
});
let dayRequestVersion = 0;
let foodRequestVersion = 0;
let stopBarcodeScan: (() => Promise<void>) | null = null;

const today = computed(() => selectedDate.value === localDateToday());
const dateTitle = computed(() => {
  if (!selectedDate.value) return '';
  const date = new Date(`${selectedDate.value}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return today.value ? `Today · ${date}` : date;
});
const currentDayData = computed(() =>
  dayData.value?.date === selectedDate.value ? dayData.value : null,
);
const totals = computed(
  () =>
    currentDayData.value?.totals ?? {
      caloriesKcal: 0,
      proteinG: 0,
      carbohydrateG: 0,
      fatG: 0,
      fiberG: 0,
    },
);
const goals = computed(() => currentDayData.value?.goals ?? null);
const foodEntries = computed(() => currentDayData.value?.entries ?? []);
const waterEntries = computed(() => currentDayData.value?.waterEntries ?? []);
const waterTotalMl = computed(() => currentDayData.value?.waterTotalMl ?? 0);
const usablePortions = computed(() =>
  (selectedFood.value?.portions ?? [])
    .filter(
      (portion) =>
        portion.grams >= 20 &&
        portion.grams <= 1000 &&
        !/guideline|quantity not specified|\bNFS\b/i.test(portion.name),
    )
    .slice(0, 3),
);
const calorieGoal = computed(() => goals.value?.caloriesKcal ?? null);
const calorieProgress = computed(() =>
  calorieGoal.value ? Math.min(1, totals.value.caloriesKcal / calorieGoal.value) : 0,
);
const waterProgress = computed(() =>
  goals.value?.waterMl ? Math.min(1, waterTotalMl.value / goals.value.waterMl) : 0,
);
const entriesByMeal = computed(
  () =>
    Object.fromEntries(
      mealTypes.map((meal) => [meal, foodEntries.value.filter((entry) => entry.mealType === meal)]),
    ) as Record<MealType, FoodEntry[]>,
);

function valueFor(key: MacroKey) {
  return totals.value[key];
}

function goalFor(key: MacroKey) {
  return goals.value?.[key] ?? null;
}

function progressFor(key: MacroKey) {
  const target = goalFor(key);
  return target ? Math.min(1, (valueFor(key) ?? 0) / target) : 0;
}

function formatAmount(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function sourceLabel(source: string) {
  if (source === 'USDA FoodData Central') return 'USDA FNDDS';
  if (source === 'Open Food Facts') return 'Open Food Facts (ODbL)';
  if (source === 'mcdo_ph_site') return "McDonald's PH website";
  if (source === 'phil_fct') return 'PhilFCT supplied data';
  if (source === 'label_scan') return 'Your confirmed label';
  if (source === 'estimate') return 'Menu estimate';
  if (source === 'LiftUp PH Menu Estimates') return 'Menu estimate';
  return 'Personal food';
}

function menuImage(name: string, source: string) {
  if (!['LiftUp PH Menu Estimates', 'mcdo_ph_site', 'estimate'].includes(source)) return '';
  if (/spaghetti/i.test(name)) return '/images/meals/spaghetti.jpg';
  if (/burger/i.test(name)) return '/images/meals/burger.jpg';
  if (/fries/i.test(name)) return '/images/meals/fries.jpg';
  if (/Pork BBQ/i.test(name)) return '/images/meals/pork-bbq.jpg';
  if (/Inasal/i.test(name)) return '/images/meals/grilled-rice.jpg';
  return /Chicken.*rice/i.test(name) ? '/images/meals/chicken-rice.jpg' : '';
}

function confidenceLabel(food: FoodSource) {
  if (food.details?.confidence === 'official') return 'Official source';
  if (food.details?.confidence === 'community') return 'Community data';
  if (food.details?.confidence === 'user' || food.isCustom) return 'Your entry';
  return 'Estimate';
}

function foodBasis(food: FoodSource) {
  return food.basis === 'per_serving' ? 'per serving' : 'per 100 g';
}
function foodNutrients(food: FoodSource) {
  return food.nutrients || food.nutrientsPer100g;
}

async function loadDay() {
  const requestVersion = ++dayRequestVersion;
  const date = selectedDate.value;
  dayLoading.value = true;
  pageError.value = '';
  pageMessage.value = '';
  try {
    const response = await axios.get<DayData>('/api/v1/nutrition/entries', {
      params: { date },
    });
    if (requestVersion === dayRequestVersion && date === selectedDate.value) {
      dayData.value = response.data;
      void loadEntryPhotos(response.data.entries, requestVersion);
    }
  } catch {
    if (requestVersion === dayRequestVersion) {
      pageError.value = 'Could not load this day. Check your connection and try again.';
    }
  } finally {
    if (requestVersion === dayRequestVersion) dayLoading.value = false;
  }
}

async function loadEntryPhotos(entries: FoodEntry[], requestVersion: number) {
  await Promise.all(
    entries
      .filter((entry) => entry.hasPhoto)
      .map(async (entry) => {
        try {
          const response = await axios.get<{ photoData: string }>(
            `/api/v1/nutrition/entries/${entry.id}/photo`,
          );
          if (requestVersion === dayRequestVersion) entry.photoData = response.data.photoData;
        } catch {
          // Keep the meal row useful if a photo is temporarily unavailable.
        }
      }),
  );
}

async function loadFoods(query: string, requestVersion = ++foodRequestVersion) {
  foodsLoading.value = true;
  foodError.value = '';
  try {
    const response = await axios.get<{ foods: FoodSource[] }>('/api/v1/nutrition/foods', {
      params: { q: query.trim() },
    });
    if (requestVersion === foodRequestVersion && query.trim() === foodQuery.value.trim()) {
      foods.value = response.data.foods;
    }
  } catch {
    if (requestVersion === foodRequestVersion && query.trim() === foodQuery.value.trim()) {
      foodError.value = 'The food catalogue could not load. Keep your search and try again.';
    }
  } finally {
    if (requestVersion === foodRequestVersion) foodsLoading.value = false;
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(foodQuery, (query) => {
  if (searchTimer) clearTimeout(searchTimer);
  const requestVersion = ++foodRequestVersion;
  foodsLoading.value = true;
  foodError.value = '';
  searchTimer = setTimeout(() => void loadFoods(query, requestVersion), 250);
});
watch(selectedDate, () => void loadDay());

function searchFor(query: string) {
  foodQuery.value = query;
}

function openFood(food: FoodSource, meal = activeMeal.value) {
  selectedFood.value = food;
  foodRetryPending.value = false;
  activeMeal.value = meal;
  const suggestedPortion = food.portions.find((item) => item.grams > 0 && item.grams <= 3000);
  const usesServingAmount =
    food.isCustom ||
    food.source === 'Open Food Facts' ||
    food.source === 'LiftUp PH Menu Estimates';
  amountGrams.value =
    food.basis === 'per_serving'
      ? 1
      : usesServingAmount && suggestedPortion
        ? Math.round(suggestedPortion.grams)
        : 100;
  mealPhoto.value = stagedMealPhoto.value;
  mealPhotoError.value = '';
  pendingFoodKey.value = newRequestKey();
  foodDialogError.value = '';
  foodDialog.value = true;
}

function usePortion(grams: number) {
  amountGrams.value = Math.max(1, Math.min(5000, Math.round(grams)));
}

function estimate(food: FoodSource, key: MacroKey) {
  const nutrient = foodNutrients(food)[key];
  if (nutrient == null || !amountGrams.value) return '—';
  return formatAmount(
    (nutrient * amountGrams.value) / (food.basis === 'per_serving' ? 1 : 100),
    key === 'caloriesKcal' ? 0 : 1,
  );
}

async function addFood() {
  if (
    !selectedFood.value ||
    !amountGrams.value ||
    amountGrams.value < (selectedFood.value.basis === 'per_serving' ? 0.1 : 1) ||
    amountGrams.value > (selectedFood.value.basis === 'per_serving' ? 20 : 5000)
  )
    return;
  saving.value = true;
  pageError.value = '';
  pageMessage.value = '';
  try {
    if (mealPhoto.value) {
      const support = await axios
        .get<{ mealPhotos?: boolean }>('/api/v1/nutrition/capabilities')
        .catch(() => null);
      if (support?.data.mealPhotos !== true) {
        foodDialogError.value =
          'Meal photos are not available on the server yet. Your photo is still here. Try again after the server update, or remove the photo to log this meal.';
        return;
      }
    }
    await axios.post('/api/v1/nutrition/entries', {
      foodId: selectedFood.value.id,
      ...(selectedFood.value.basis === 'per_serving'
        ? { amountServings: amountGrams.value }
        : { amountGrams: amountGrams.value }),
      localDate: selectedDate.value,
      mealType: activeMeal.value,
      requestKey: pendingFoodKey.value || newRequestKey(),
      ...(mealPhoto.value ? { photoData: mealPhoto.value } : {}),
    });
    foodRetryPending.value = false;
    foodDialog.value = false;
    pendingFoodKey.value = '';
    stagedMealPhoto.value = '';
    mealPhoto.value = '';
    await loadDay();
    pageMessage.value = 'Meal added to your day.';
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    foodRetryPending.value = status == null || status >= 500;
    foodDialogError.value = foodRetryPending.value
      ? "We couldn't confirm the save. Retry this unchanged entry to check safely."
      : 'The meal was not saved. Check the details and try again.';
  } finally {
    saving.value = false;
  }
}

async function addWater(amountMl: number) {
  if (saving.value) return;
  saving.value = true;
  pageError.value = '';
  pageMessage.value = '';
  const localDate = selectedDate.value;
  const pendingKey = `${localDate}:${amountMl}`;
  const requestKey = pendingWaterKeys.get(pendingKey) ?? newRequestKey();
  pendingWaterKeys.set(pendingKey, requestKey);
  try {
    await axios.post('/api/v1/nutrition/water', {
      amountMl,
      localDate,
      requestKey,
    });
    pendingWaterKeys.delete(pendingKey);
    await loadDay();
    pageMessage.value = `${amountMl} ml water logged.`;
  } catch {
    pageError.value = 'Water was not confirmed. Tap the same amount again to safely retry.';
  } finally {
    saving.value = false;
  }
}

async function removeFood(entry: FoodEntry) {
  try {
    await axios.delete(`/api/v1/nutrition/entries/${entry.id}`);
    await loadDay();
    pageMessage.value = 'Food removed from your log.';
  } catch {
    pageError.value = 'Could not remove that food. Try again.';
  }
}

function openCameraPhotoPicker() {
  if (isAndroid) return void pickMealPhoto('camera');
  cameraPhotoInput.value?.click();
}

function openGalleryPhotoPicker() {
  if (isAndroid) return void pickMealPhoto('photos');
  galleryPhotoInput.value?.click();
}

function photoWasCancelled(error: unknown) {
  return /cancel|no image selected/i.test(error instanceof Error ? error.message : String(error));
}

async function pickNativePhoto(source: 'camera' | 'photos') {
  const { Camera, CameraSource, CameraResultType } = await import('@capacitor/camera');
  // Base64 crosses the native bridge safely; Android picker File objects can be unreadable.
  const photo = await Camera.getPhoto({
    source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    resultType: CameraResultType.Base64,
    quality: 85,
    width: 2048,
    height: 2048,
    correctOrientation: true,
    saveToGallery: false,
  });
  if (!photo.base64String) throw new Error('The selected photo could not be read.');
  return `data:image/${photo.format};base64,${photo.base64String}`;
}

async function pickMealPhoto(source: 'camera' | 'photos') {
  if (mealPhotoPicking.value) return;
  mealPhotoPicking.value = true;
  mealPhotoError.value = '';
  try {
    const dataUrl = await pickNativePhoto(source);
    const blob = await (await fetch(dataUrl)).blob();
    const compressed = await compressMealPhoto(new File([blob], 'meal.jpg', { type: blob.type }));
    stagedMealPhoto.value = compressed;
    mealPhoto.value = compressed;
    pageMessage.value = 'Photo ready. Choose a food and save it with your meal.';
  } catch (error) {
    if (!photoWasCancelled(error))
      mealPhotoError.value =
        'Could not open this photo. Check camera access or choose another image.';
  } finally {
    mealPhotoPicking.value = false;
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Could not read the selected photo.'));
    reader.onerror = () => reject(new Error('Could not read the selected photo.'));
    reader.readAsDataURL(blob);
  });
}

async function compressMealPhoto(file: File, maximumSide = 1280) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  let longestSide = Math.min(maximumSide, Math.max(bitmap.width, bitmap.height));
  let quality = 0.82;
  try {
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const scale = Math.min(1, longestSide / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not prepare this photo.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality),
      );
      if (blob && blob.size <= 900 * 1024) return await blobToDataUrl(blob);
      longestSide = Math.round(longestSide * 0.82);
      quality = Math.max(0.42, quality - 0.07);
    }
  } finally {
    bitmap.close();
  }
  throw new Error('This photo is too large to attach. Choose a smaller photo.');
}

async function handleMealPhotoSelection(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  mealPhotoError.value = '';
  try {
    const dataUrl = await compressMealPhoto(file);
    stagedMealPhoto.value = dataUrl;
    mealPhoto.value = dataUrl;
    pageMessage.value = 'Photo ready. Choose a food and save it with your meal.';
  } catch {
    mealPhotoError.value = 'Could not prepare this photo. Try another image or a smaller file.';
  } finally {
    input.value = '';
  }
}

function removeMealPhoto() {
  mealPhoto.value = '';
  stagedMealPhoto.value = '';
  mealPhotoError.value = '';
}

async function stopActiveBarcodeScan() {
  const stop = stopBarcodeScan;
  stopBarcodeScan = null;
  barcodeScanActive.value = false;
  torchEnabled.value = false;
  torchAvailable.value = false;
  document.body.classList.remove('barcode-scanner-active');
  if (stop) await stop().catch(() => {});
}

function openMissingProduct(barcode: string, name = '') {
  openCustomFood();
  customFoodDraft.barcode = barcode;
  customFoodDraft.name = name;
  customFoodDraft.basis = 'per_serving';
  labelMode.value = true;
  foodError.value =
    'This product needs label values. Photograph the Nutrition Facts panel or enter them below, then check every field.';
}

async function lookupBarcode(value: string) {
  const barcode = normalizeBarcode(value);
  if (!barcode) {
    barcodeError.value = 'Check every digit, including the final check digit.';
    return;
  }
  if (!navigator.onLine) {
    barcodeError.value =
      'You are offline. Connect to look up or save a product. Label text can still be read on this phone.';
    return;
  }
  try {
    const response = await axios.post<{ food: FoodSource }>('/api/v1/nutrition/barcode', {
      barcode,
    });
    const food = response.data.food;
    foods.value = [food, ...foods.value.filter((item) => item.id !== food.id)].slice(0, 60);
    foodQuery.value = food.name;
    manualBarcodeDialog.value = false;
    openFood(food);
    pageMessage.value = 'Product found. Check its serving and source before saving.';
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const data = axios.isAxiosError(error)
      ? (error.response?.data as
          { error?: string; needsLabel?: boolean; productName?: string } | undefined)
      : undefined;
    if (status === 404 || (status === 422 && data?.needsLabel)) {
      manualBarcodeDialog.value = false;
      openMissingProduct(barcode, data?.productName || '');
      return;
    }
    barcodeError.value =
      data?.error || 'Could not look up this barcode. Check your connection and try again.';
  }
}

async function submitManualBarcode() {
  if (barcodeBusy.value) return;
  barcodeBusy.value = true;
  barcodeError.value = '';
  try {
    const code = normalizeBarcode(manualBarcode.value, manualBarcodeFormat.value);
    if (!code) {
      barcodeError.value =
        'That barcode has an invalid check digit. Check the digits and code type.';
      return;
    }
    await lookupBarcode(code);
  } finally {
    barcodeBusy.value = false;
  }
}

async function toggleScannerTorch() {
  try {
    const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
    await BarcodeScanner.toggleTorch();
    torchEnabled.value = (await BarcodeScanner.isTorchEnabled()).enabled;
  } catch {
    barcodeError.value = 'The torch is unavailable on this camera.';
  }
}

async function scanBarcode() {
  if (!isAndroid || barcodeBusy.value) return;
  barcodeBusy.value = true;
  barcodeError.value = '';
  torchAvailable.value = false;
  torchEnabled.value = false;
  try {
    const { BarcodeScanner, BarcodeFormat, LensFacing, Resolution } =
      await import('@capacitor-mlkit/barcode-scanning');
    if (!(await BarcodeScanner.isSupported()).supported) {
      barcodeError.value =
        'No supported camera was found. Enter the barcode or choose a barcode photo.';
      return;
    }
    let { camera } = await BarcodeScanner.checkPermissions();
    if (camera !== 'granted') ({ camera } = await BarcodeScanner.requestPermissions());
    if (camera !== 'granted') {
      barcodeError.value =
        'Camera access was denied. Allow camera access in Android settings, or enter the barcode manually.';
      return;
    }
    const stableRead = createBarcodeStabilizer(2);
    barcodeScanActive.value = true;
    document.body.classList.add('barcode-scanner-active');
    const listener = await BarcodeScanner.addListener('barcodesScanned', ({ barcodes }) => {
      void (async () => {
        if (!barcodeScanActive.value) return;
        const read = barcodes[0];
        if (!read) return;
        const barcode = stableRead(read.rawValue || read.displayValue || '', read.format);
        if (!barcode) return;
        await stopActiveBarcodeScan();
        try {
          await lookupBarcode(barcode);
        } finally {
          barcodeBusy.value = false;
        }
      })().catch(() => {
        barcodeError.value = 'Could not read that barcode. Try again.';
        barcodeBusy.value = false;
      });
    });
    stopBarcodeScan = async () => {
      await listener.remove();
      await BarcodeScanner.stopScan();
    };
    const errors = await BarcodeScanner.addListener('scanError', () => {
      void stopActiveBarcodeScan().finally(() => {
        barcodeBusy.value = false;
        barcodeError.value = 'The camera stopped. Try again or enter the barcode.';
      });
    });
    stopBarcodeScan = async () => {
      await listener.remove();
      await errors.remove();
      await BarcodeScanner.stopScan();
      torchEnabled.value = false;
    };
    await BarcodeScanner.startScan({
      formats: [BarcodeFormat.Ean8, BarcodeFormat.Ean13, BarcodeFormat.UpcA, BarcodeFormat.UpcE],
      lensFacing: LensFacing.Back,
      resolution: Resolution['1280x720'],
    });
    torchAvailable.value = (
      await BarcodeScanner.isTorchAvailable().catch(() => ({ available: false }))
    ).available;
  } catch {
    await stopActiveBarcodeScan();
    barcodeError.value =
      'Could not open the rear camera. Check camera access, or use manual/photo entry.';
  } finally {
    if (!barcodeScanActive.value) barcodeBusy.value = false;
  }
}

async function withNativeImage<T>(
  dataUrl: string,
  work: (path: string, dataUrl: string) => Promise<T>,
) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const path = `nutrition-label-${newRequestKey()}.jpg`;
  const saved = await Filesystem.writeFile({
    path,
    directory: Directory.Cache,
    data: dataUrl.split(',')[1] || '',
  });
  try {
    return await work(saved.uri, dataUrl);
  } finally {
    await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});
  }
}

async function handleBarcodePhoto() {
  if (!isAndroid || barcodeBusy.value) return;
  barcodeBusy.value = true;
  barcodeError.value = '';
  try {
    const { BarcodeScanner, BarcodeFormat } = await import('@capacitor-mlkit/barcode-scanning');
    const dataUrl = await pickNativePhoto('photos');
    const result = await withNativeImage(dataUrl, (path) =>
      BarcodeScanner.readBarcodesFromImage({
        path,
        formats: [BarcodeFormat.Ean8, BarcodeFormat.Ean13, BarcodeFormat.UpcA, BarcodeFormat.UpcE],
      }),
    );
    const codes = [
      ...new Set(
        result.barcodes
          .map((read) => normalizeBarcode(read.rawValue || read.displayValue || '', read.format))
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    if (codes.length !== 1) {
      barcodeError.value = codes.length
        ? 'More than one barcode was found. Crop to one product or enter its barcode.'
        : 'No valid food barcode was found. Try a clearer photo or enter it manually.';
      return;
    }
    await lookupBarcode(codes[0] || '');
  } catch (error) {
    if (!photoWasCancelled(error))
      barcodeError.value =
        'Could not read that photo. Use a clear barcode photo or enter the digits.';
  } finally {
    barcodeBusy.value = false;
  }
}

async function handleLabelPhoto(source: 'camera' | 'photos') {
  if (!isAndroid || labelBusy.value) return;
  labelBusy.value = true;
  labelConfirmed.value = false;
  foodError.value = '';
  try {
    const photo = await pickNativePhoto(source);
    labelPhoto.value = '';
    labelText.value = '';
    labelMode.value = true;
    for (const key of [
      'caloriesKcal',
      'proteinG',
      'carbohydrateG',
      'fatG',
      'fiberG',
      'sugarG',
      'sodiumMg',
      'defaultServingGrams',
    ] as const)
      customFoodDraft[key] = null;
    const { TextRecognition, Script } = await import('@capacitor-mlkit/text-recognition');
    const result = await withNativeImage(photo, async (path, dataUrl) => {
      labelPhoto.value = dataUrl;
      return TextRecognition.processImage({ path, script: Script.Latin });
    });
    labelText.value = result.text;
    const parsed = parseNutritionLabel(result.text);
    // Start from unknown fields so a previous photo cannot leave stale values behind.
    for (const key of [
      'caloriesKcal',
      'proteinG',
      'carbohydrateG',
      'fatG',
      'fiberG',
      'sugarG',
      'sodiumMg',
      'defaultServingGrams',
    ] as const)
      customFoodDraft[key] = parsed.fields[key] ?? null;
    customFoodDraft.basis = parsed.basis;
    labelMode.value = true;
    foodError.value =
      'Text is a draft. Check the serving basis and every value against your photo. Leave unavailable values blank.';
  } catch (error) {
    if (!photoWasCancelled(error))
      foodError.value =
        'Could not read the label. Try a clearer photo, check camera access, or enter the values manually.';
  } finally {
    labelBusy.value = false;
  }
}

async function cancelBarcodeScan() {
  await stopActiveBarcodeScan();
  barcodeBusy.value = false;
}

async function removeWater(entry: WaterEntry) {
  try {
    await axios.delete(`/api/v1/nutrition/water/${entry.id}`);
    await loadDay();
  } catch {
    pageError.value = 'Could not remove that water entry. Try again.';
  }
}

function openGoals() {
  goalsError.value = '';
  for (const key of [
    'caloriesKcal',
    'proteinG',
    'carbohydrateG',
    'fatG',
    'fiberG',
    'waterMl',
  ] as const) {
    goalDraft[key] = goals.value?.[key] ?? null;
  }
  goalsDialog.value = true;
}

function handleFoodDialogHide() {
  if (!foodRetryPending.value) return;
  foodRetryPending.value = false;
  pendingFoodKey.value = '';
  void loadDay();
}

function openCustomFood() {
  Object.assign(customFoodDraft, {
    name: '',
    barcode: '',
    brand: '',
    basis: 'per_100g',
    servingSizeText: '',
    caloriesKcal: null,
    proteinG: null,
    carbohydrateG: null,
    fatG: null,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    defaultServingGrams: null,
  });
  labelPhoto.value = '';
  labelText.value = '';
  labelConfirmed.value = false;
  labelMode.value = false;
  foodError.value = '';
  customFoodDialog.value = true;
}

async function saveGoals() {
  saving.value = true;
  pageError.value = '';
  try {
    const payload = Object.fromEntries(
      Object.entries(goalDraft).map(([key, value]) => [key, nullableNumber(value)]),
    ) as Goals;
    const saved = (await axios.put<{ goals: Goals }>('/api/v1/nutrition/goals', payload)).data
      .goals;
    if (currentDayData.value) currentDayData.value.goals = saved;
    goalsDialog.value = false;
    pageMessage.value = 'Daily targets saved.';
  } catch {
    goalsError.value = 'Targets could not be saved. Check your connection and try again.';
  } finally {
    saving.value = false;
  }
}

async function saveCustomFood() {
  if (!customFoodDraft.name.trim()) return;
  if ((labelMode.value || customFoodDraft.barcode) && !labelConfirmed.value) {
    foodError.value = 'Check every field against the label and confirm before saving.';
    return;
  }
  saving.value = true;
  foodError.value = '';
  try {
    const food = (
      await axios.post<{ food: FoodSource }>('/api/v1/nutrition/foods', {
        name: customFoodDraft.name.trim(),
        barcode: customFoodDraft.barcode || undefined,
        brand: customFoodDraft.brand,
        basis: customFoodDraft.basis,
        servingSizeText: customFoodDraft.servingSizeText,
        sugarG: nullableNumber(customFoodDraft.sugarG),
        sodiumMg: nullableNumber(customFoodDraft.sodiumMg),
        source: labelMode.value || customFoodDraft.barcode ? 'label_scan' : undefined,
        labelConfirmed: labelConfirmed.value,
        caloriesKcal: nullableNumber(customFoodDraft.caloriesKcal),
        proteinG: nullableNumber(customFoodDraft.proteinG),
        carbohydrateG: nullableNumber(customFoodDraft.carbohydrateG),
        fatG: nullableNumber(customFoodDraft.fatG),
        fiberG: nullableNumber(customFoodDraft.fiberG),
        defaultServingGrams: nullableNumber(customFoodDraft.defaultServingGrams),
      })
    ).data.food;
    customFoodDialog.value = false;
    customFoodDraft.name = '';
    customFoodDraft.caloriesKcal = null;
    customFoodDraft.proteinG = null;
    customFoodDraft.carbohydrateG = null;
    customFoodDraft.fatG = null;
    customFoodDraft.fiberG = null;
    customFoodDraft.defaultServingGrams = null;
    await loadFoods(foodQuery.value);
    openFood(food);
  } catch (error) {
    const data = axios.isAxiosError(error)
      ? (error.response?.data as { error?: string } | undefined)
      : undefined;
    foodError.value =
      data?.error ||
      'The food was not saved. Check your connection, name, serving basis, and nutrition values.';
  } finally {
    saving.value = false;
  }
}

function scrollToSearch(meal: MealType) {
  activeMeal.value = meal;
  document
    .getElementById('nutrition-food-search')
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.querySelector<HTMLInputElement>('#nutrition-search-input input')?.focus();
}

onMounted(() => {
  void loadDay();
  void loadFoods(foodQuery.value);
});
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
  dayRequestVersion += 1;
  foodRequestVersion += 1;
  void stopActiveBarcodeScan();
});
</script>

<template>
  <q-page padding class="nutrition-page">
    <header class="nutrition-heading">
      <div>
        <h2>Nutrition</h2>
        <p class="heading-copy">A simple daily log for meals, macros, and water.</p>
      </div>
      <div class="heading-actions">
        <q-input
          v-model="selectedDate"
          type="date"
          dense
          outlined
          label="Day"
          class="date-input"
          :disable="saving || foodRetryPending"
        />
        <q-btn outline no-caps icon="tune" label="Targets" @click="openGoals" />
      </div>
    </header>

    <p v-if="pageError" class="inline-error" role="alert">{{ pageError }}</p>
    <p v-if="pageMessage" class="inline-success" role="status">{{ pageMessage }}</p>

    <section class="daily-card" aria-label="Daily nutrition summary">
      <div class="daily-card-top">
        <div>
          <h3>{{ dateTitle }}</h3>
        </div>
        <q-skeleton v-if="dayLoading" type="text" width="68px" aria-label="Loading daily summary" />
      </div>
      <div class="energy-line">
        <div class="energy-total">
          <span class="energy-label">Calories logged</span>
          <strong class="energy-value"
            >{{ formatAmount(totals.caloriesKcal) }} <small>kcal</small></strong
          >
        </div>
        <div v-if="calorieGoal" class="energy-target">
          <strong>{{ formatAmount(Math.max(0, calorieGoal - totals.caloriesKcal)) }}</strong>
          <span>kcal left of {{ formatAmount(calorieGoal) }}</span>
        </div>
        <div v-else class="energy-target">
          <strong>No calorie target</strong>
          <span>Add your own target when useful</span>
        </div>
      </div>
      <q-linear-progress
        v-if="calorieGoal"
        rounded
        size="8px"
        :value="calorieProgress"
        color="primary"
        track-color="grey-8"
        class="energy-progress"
      />
      <div class="macro-grid">
        <article v-for="macro in macroCards" :key="macro.key" class="macro-card">
          <span class="macro-caption">{{ macro.short }}</span>
          <strong>{{ formatAmount(totals[macro.key], 1) }}<small> g</small></strong>
          <span class="macro-goal">
            {{
              totals[macro.key] == null
                ? 'some foods lack fiber data'
                : goalFor(macro.key)
                  ? `of ${formatAmount(goalFor(macro.key), 1)} g`
                  : 'no target set'
            }}
          </span>
          <q-linear-progress
            v-if="goalFor(macro.key) && totals[macro.key] != null"
            rounded
            size="4px"
            :value="progressFor(macro.key)"
            color="primary"
            track-color="grey-8"
          />
        </article>
      </div>
    </section>

    <section class="water-card" aria-label="Water tracker">
      <div class="water-main">
        <div class="water-icon"><q-icon name="water_drop" size="22px" /></div>
        <div class="water-info">
          <h3>Water</h3>
          <p>
            <strong>{{ formatAmount(waterTotalMl) }} ml</strong
            ><span v-if="goals?.waterMl"> of {{ formatAmount(goals.waterMl) }} ml</span
            ><span v-else> logged</span>
          </p>
        </div>
        <div class="water-actions">
          <q-btn outline no-caps label="+250 ml" :disable="saving" @click="addWater(250)" />
          <q-btn outline no-caps label="+500 ml" :disable="saving" @click="addWater(500)" />
        </div>
      </div>
      <q-linear-progress
        v-if="goals?.waterMl"
        rounded
        size="5px"
        :value="waterProgress"
        color="info"
        track-color="grey-8"
      />
      <div v-if="waterEntries.length" class="water-history">
        <span v-for="item in waterEntries" :key="item.id" class="water-pill">
          {{ formatAmount(item.amountMl) }} ml
          <button
            type="button"
            :aria-label="`Remove ${formatAmount(item.amountMl)} milliliter water entry`"
            @click="removeWater(item)"
          >
            <q-icon name="close" size="14px" />
          </button>
        </span>
      </div>
    </section>

    <section id="nutrition-food-search" class="food-search-section">
      <div class="section-heading">
        <div>
          <h3>Add food</h3>
        </div>
        <div class="food-search-actions">
          <q-btn
            outline
            no-caps
            icon="photo_camera"
            label="Take photo"
            @click="openCameraPhotoPicker"
          />
          <q-btn
            flat
            no-caps
            icon="photo_library"
            label="Gallery"
            @click="openGalleryPhotoPicker"
          />
          <q-btn
            v-if="isAndroid"
            outline
            no-caps
            icon="qr_code_scanner"
            label="Scan barcode"
            :loading="barcodeBusy"
            :disable="barcodeBusy || saving"
            @click="scanBarcode"
          />
          <q-btn outline no-caps icon="add" label="My food" @click="openCustomFood" />
          <template v-if="isAndroid">
            <q-btn
              flat
              no-caps
              icon="keyboard"
              label="Enter barcode"
              @click="
                manualBarcodeDialog = true;
                barcodeError = '';
              "
            />
            <q-btn
              flat
              no-caps
              icon="image_search"
              label="Barcode photo"
              :loading="barcodeBusy"
              @click="handleBarcodePhoto"
            />
          </template>
        </div>
      </div>
      <input
        ref="cameraPhotoInput"
        class="meal-photo-input"
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Take a meal photo"
        @change="handleMealPhotoSelection"
      />
      <input
        ref="galleryPhotoInput"
        class="meal-photo-input"
        type="file"
        accept="image/*"
        aria-label="Choose a meal photo"
        @change="handleMealPhotoSelection"
      />
      <q-input
        id="nutrition-search-input"
        v-model="foodQuery"
        outlined
        clearable
        placeholder="Search foods, e.g. adobo, rice, egg"
        aria-label="Search nutrition foods"
      >
        <template #prepend><q-icon name="search" /></template>
      </q-input>
      <div v-if="stagedMealPhoto" class="meal-photo-staged">
        <img :src="stagedMealPhoto" alt="Meal photo ready to attach" />
        <div>
          <strong>Meal photo ready</strong>
          <span>Choose a food below and save it with your log.</span>
        </div>
        <q-btn
          flat
          round
          dense
          icon="close"
          aria-label="Remove meal photo"
          @click="removeMealPhoto"
        />
      </div>
      <p v-if="mealPhotoError" class="inline-error" role="alert">{{ mealPhotoError }}</p>
      <p v-if="barcodeError" class="inline-error" role="alert">{{ barcodeError }}</p>
      <div class="quick-searches" aria-label="Popular food searches">
        <button
          v-for="term in [
            'Adobo',
            'Rice',
            'Egg',
            'Chicken',
            'Banana',
            'McDo',
            'Jollibee',
            'Mang Inasal',
          ]"
          :key="term"
          type="button"
          @click="searchFor(term.toLowerCase())"
        >
          {{ term }}
        </button>
      </div>
      <div v-if="foodError" class="catalog-error" role="alert">
        <span>{{ foodError }}</span
        ><q-btn flat no-caps label="Try again" @click="loadFoods(foodQuery)" />
      </div>
      <div v-else-if="foodsLoading" class="food-results" role="status" aria-label="Searching foods">
        <q-skeleton v-for="item in 3" :key="item" type="rect" height="62px" class="food-skeleton" />
      </div>
      <div v-else-if="foods.length" class="food-results">
        <button
          v-for="food in foods"
          :key="food.id"
          type="button"
          class="food-result"
          @click="openFood(food)"
        >
          <img
            v-if="menuImage(food.name, food.source)"
            class="food-menu-image"
            :src="menuImage(food.name, food.source)"
            alt="Illustrative meal photo"
            loading="lazy"
          />
          <span class="food-result-main">
            <strong>{{ food.name }}</strong>
            <span class="nutrition-source-badges"
              ><span>{{ confidenceLabel(food) }}</span
              ><span v-if="food.details?.needsReview">Needs review</span></span
            >
            <small
              >{{ food.category || sourceLabel(food.source) }} · {{ sourceLabel(food.source)
              }}{{ menuImage(food.name, food.source) ? ' · Illustrative photo' : '' }}</small
            >
          </span>
          <span class="food-result-kcal"
            >{{ formatAmount(foodNutrients(food).caloriesKcal)
            }}<small> kcal {{ foodBasis(food) }}</small></span
          >
          <q-icon name="add_circle_outline" size="22px" class="food-add-icon" />
        </button>
      </div>
      <div v-else class="catalog-empty">
        <q-icon name="restaurant" size="26px" />
        <p>No foods found for “{{ foodQuery }}”. Try another search or add your own food.</p>
      </div>
      <p class="source-note">
        Check each food's source, serving basis, and confidence badge. Estimates and missing values
        are labeled. Data from Open Food Facts (ODbL) is community supplied.
      </p>
    </section>

    <section class="meal-sections" aria-label="Meals for selected day">
      <div class="section-heading meal-heading">
        <div>
          <h3>Meals</h3>
        </div>
        <span class="meal-count"
          >{{ foodEntries.length }} {{ foodEntries.length === 1 ? 'item' : 'items' }}</span
        >
      </div>
      <article v-for="meal in mealTypes" :key="meal" class="meal-card">
        <header class="meal-card-heading">
          <div>
            <h4>{{ meal }}</h4>
            <span
              >{{ (entriesByMeal[meal] || []).length }}
              {{ (entriesByMeal[meal] || []).length === 1 ? 'item' : 'items' }}</span
            >
          </div>
          <q-btn
            flat
            round
            dense
            icon="add"
            :aria-label="`Add food to ${meal}`"
            @click="scrollToSearch(meal)"
          />
        </header>
        <div v-if="entriesByMeal[meal]?.length" class="meal-entries">
          <div v-for="entry in entriesByMeal[meal]" :key="entry.id" class="meal-entry">
            <img
              v-if="entry.photoData || menuImage(entry.foodName, entry.source)"
              class="meal-entry-photo"
              :src="entry.photoData || menuImage(entry.foodName, entry.source)"
              :alt="
                entry.photoData ? `Photo of ${entry.foodName}` : `Illustration of ${entry.foodName}`
              "
            />
            <div class="meal-entry-main">
              <strong>{{ entry.foodName }}</strong>
              <span
                >{{
                  entry.amountServings != null
                    ? `${formatAmount(entry.amountServings, 1)} serving(s)`
                    : `${formatAmount(entry.amountGrams, 1)} g`
                }}
                · {{ sourceLabel(entry.source) }}</span
              >
            </div>
            <div class="meal-entry-values">
              <strong>{{ formatAmount(entry.caloriesKcal) }} kcal</strong>
              <span
                >P {{ formatAmount(entry.proteinG, 1) }} · C
                {{ formatAmount(entry.carbohydrateG, 1) }} · F
                {{ formatAmount(entry.fatG, 1) }} g</span
              >
            </div>
            <q-btn
              flat
              round
              dense
              icon="delete_outline"
              color="grey-6"
              :aria-label="`Remove ${entry.foodName}`"
              @click="removeFood(entry)"
            />
          </div>
        </div>
        <p v-else class="meal-empty">Nothing logged yet.</p>
      </article>
    </section>

    <q-dialog v-model="foodDialog" :persistent="saving" @hide="handleFoodDialogHide">
      <q-card class="nutrition-dialog">
        <q-card-section class="dialog-heading">
          <div>
            <h3>{{ selectedFood?.name }}</h3>
            <p class="dialog-source">Add to {{ activeMeal }}</p>
          </div>
          <q-btn
            flat
            round
            dense
            icon="close"
            aria-label="Close food entry"
            :disable="saving"
            @click="foodDialog = false"
          />
        </q-card-section>
        <q-card-section v-if="selectedFood" class="dialog-body">
          <p class="dialog-source">
            {{ sourceLabel(selectedFood.source) }} · nutrients {{ foodBasis(selectedFood) }}
          </p>
          <div class="nutrition-source-badges">
            <span>{{ confidenceLabel(selectedFood) }}</span
            ><span v-if="selectedFood.details?.needsReview">Needs review</span>
          </div>
          <p v-if="selectedFood.details?.servingSizeText" class="source-note">
            {{ selectedFood.details.servingSizeText }}
          </p>
          <div class="portion-row">
            <q-input
              v-model.number="amountGrams"
              type="number"
              :min="selectedFood.basis === 'per_serving' ? 0.1 : 1"
              :max="selectedFood.basis === 'per_serving' ? 20 : 5000"
              :suffix="selectedFood.basis === 'per_serving' ? 'servings' : 'g'"
              step="0.1"
              outlined
              label="Amount"
              inputmode="decimal"
              :disable="saving || foodRetryPending"
            />
            <div
              v-if="usablePortions.length && selectedFood.basis !== 'per_serving'"
              class="portion-buttons"
            >
              <button
                v-for="portion in usablePortions"
                :key="`${portion.name}-${portion.grams}`"
                type="button"
                :title="`${portion.name}: ${formatAmount(portion.grams, 1)} g`"
                :aria-label="`Use ${portion.name}, ${formatAmount(portion.grams, 1)} grams`"
                :disabled="saving || foodRetryPending"
                @click="usePortion(portion.grams)"
              >
                {{ portion.name }} · {{ formatAmount(portion.grams) }} g
              </button>
            </div>
          </div>
          <q-select
            v-model="activeMeal"
            :options="mealTypes"
            outlined
            label="Meal"
            :disable="saving || foodRetryPending"
          />
          <div class="food-photo-controls">
            <q-btn
              flat
              no-caps
              icon="photo_camera"
              label="Take photo"
              :disable="saving"
              @click="openCameraPhotoPicker"
            />
            <q-btn
              flat
              no-caps
              icon="photo_library"
              label="Choose photo"
              :disable="saving"
              @click="openGalleryPhotoPicker"
            />
          </div>
          <div v-if="mealPhoto" class="food-photo-preview">
            <img :src="mealPhoto" alt="Photo attached to this food log" />
            <q-btn
              flat
              no-caps
              icon="close"
              label="Remove photo"
              :disable="saving"
              @click="removeMealPhoto"
            />
          </div>
          <p v-if="mealPhotoError" class="inline-error" role="alert">{{ mealPhotoError }}</p>
          <div class="estimate-grid">
            <div>
              <span>Calories</span
              ><strong>{{ estimate(selectedFood, 'caloriesKcal') }} kcal</strong>
            </div>
            <div>
              <span>Protein</span><strong>{{ estimate(selectedFood, 'proteinG') }} g</strong>
            </div>
            <div>
              <span>Carbs</span><strong>{{ estimate(selectedFood, 'carbohydrateG') }} g</strong>
            </div>
            <div>
              <span>Fat</span><strong>{{ estimate(selectedFood, 'fatG') }} g</strong>
            </div>
          </div>
          <p v-if="selectedFood.details" class="source-note">
            Sugar: {{ formatAmount(selectedFood.details.sugarG, 1) }} g · Sodium:
            {{ formatAmount(selectedFood.details.sodiumMg) }} mg {{ foodBasis(selectedFood) }}
          </p>
          <p v-if="selectedFood.details?.needsReview" class="inline-error">
            {{
              selectedFood.details.reviewReason ||
              'The item, portion, or source still needs review.'
            }}
          </p>
          <p v-if="selectedFood.details?.notes" class="source-note">
            {{ selectedFood.details.notes }}
          </p>
          <p v-if="selectedFood.details?.sourceUrl" class="source-note">
            <a :href="selectedFood.details.sourceUrl" target="_blank" rel="noopener noreferrer"
              >View source</a
            >
            · Retrieved {{ selectedFood.details.retrievedAt }}
          </p>
          <p class="source-note">
            {{
              selectedFood.source === 'Open Food Facts'
                ? 'Data from Open Food Facts (ODbL). Community-supplied label data; check your package.'
                : 'Check the source, confidence badge, and serving basis. Recipes and actual portions may vary.'
            }}
          </p>
          <p v-if="mealPhoto" class="source-note">
            This photo is saved with your private meal entry.
          </p>
          <p v-if="foodDialogError" class="inline-error" role="alert">{{ foodDialogError }}</p>
        </q-card-section>
        <q-card-actions align="right" class="dialog-actions">
          <q-btn flat no-caps label="Cancel" :disable="saving" @click="foodDialog = false" />
          <q-btn
            unelevated
            no-caps
            color="primary"
            label="Add to day"
            :loading="saving"
            :disable="
              !amountGrams ||
              amountGrams < (selectedFood?.basis === 'per_serving' ? 0.1 : 1) ||
              amountGrams > (selectedFood?.basis === 'per_serving' ? 20 : 5000)
            "
            @click="addFood"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="goalsDialog" :persistent="saving">
      <q-card class="nutrition-dialog">
        <q-card-section class="dialog-heading"
          ><div><h3>Daily targets</h3></div>
          <q-btn
            flat
            round
            dense
            icon="close"
            aria-label="Close targets"
            :disable="saving"
            @click="goalsDialog = false"
        /></q-card-section>
        <q-card-section class="goal-form">
          <p class="source-note">
            Targets are optional and belong to your LiftUp account. Use a plan that suits you.
          </p>
          <q-input
            v-model.number="goalDraft.caloriesKcal"
            type="number"
            min="0"
            max="10000"
            outlined
            label="Calories (kcal)"
          />
          <q-input
            v-model.number="goalDraft.proteinG"
            type="number"
            min="0"
            max="1000"
            outlined
            label="Protein (g)"
          />
          <q-input
            v-model.number="goalDraft.carbohydrateG"
            type="number"
            min="0"
            max="2000"
            outlined
            label="Carbohydrates (g)"
          />
          <q-input
            v-model.number="goalDraft.fatG"
            type="number"
            min="0"
            max="1000"
            outlined
            label="Fat (g)"
          />
          <q-input
            v-model.number="goalDraft.fiberG"
            type="number"
            min="0"
            max="500"
            outlined
            label="Fiber (g)"
          />
          <q-input
            v-model.number="goalDraft.waterMl"
            type="number"
            min="0"
            max="20000"
            outlined
            label="Water (ml)"
          />
          <p v-if="goalsError" class="inline-error" role="alert">{{ goalsError }}</p>
        </q-card-section>
        <q-card-actions align="right" class="dialog-actions"
          ><q-btn
            flat
            no-caps
            label="Cancel"
            :disable="saving"
            @click="goalsDialog = false" /><q-btn
            unelevated
            no-caps
            color="primary"
            label="Save targets"
            :loading="saving"
            @click="saveGoals"
        /></q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="customFoodDialog" :persistent="saving || labelBusy">
      <q-card class="nutrition-dialog">
        <q-card-section class="dialog-heading"
          ><div>
            <h3>{{ labelMode ? 'Add this product' : 'Add a personal food' }}</h3>
          </div>
          <q-btn
            flat
            round
            dense
            icon="close"
            aria-label="Close custom food form"
            :disable="saving || labelBusy"
            @click="customFoodDialog = false"
        /></q-card-section>
        <q-card-section class="goal-form">
          <p class="source-note">
            Use the exact serving basis printed on your label. Blank values mean unknown. This food
            is visible only to your account; saving the same barcode updates its existing record.
          </p>
          <div v-if="isAndroid" class="food-photo-controls">
            <q-btn
              outline
              no-caps
              icon="document_scanner"
              label="Photograph label"
              :loading="labelBusy"
              :disable="saving"
              @click="handleLabelPhoto('camera')"
            />
            <q-btn
              flat
              no-caps
              icon="photo_library"
              label="Choose label photo"
              :disable="saving || labelBusy"
              @click="handleLabelPhoto('photos')"
            />
          </div>
          <img
            v-if="labelPhoto"
            :src="labelPhoto"
            alt="Nutrition Facts panel to review"
            class="nutrition-label-photo"
          />
          <details v-if="labelText">
            <summary>Recognized text — check against the photo</summary>
            <pre class="nutrition-label-text">{{ labelText }}</pre>
          </details>
          <q-input
            :disable="saving || labelBusy"
            v-model="customFoodDraft.barcode"
            outlined
            maxlength="14"
            label="Barcode (optional)"
            inputmode="numeric"
          />
          <q-input v-model="customFoodDraft.name" outlined maxlength="120" label="Food name" />
          <q-input
            :disable="saving || labelBusy"
            v-model="customFoodDraft.brand"
            outlined
            maxlength="100"
            label="Brand (optional)"
          />
          <q-select
            :disable="saving || labelBusy"
            v-model="customFoodDraft.basis"
            emit-value
            map-options
            :options="[
              { label: 'Per serving', value: 'per_serving' },
              { label: 'Per 100 g', value: 'per_100g' },
            ]"
            outlined
            label="Nutrition basis on the label"
          />
          <q-input
            :disable="saving || labelBusy"
            v-model="customFoodDraft.servingSizeText"
            outlined
            maxlength="100"
            label="Serving description (e.g. 1 can, 55 g)"
          />
          <q-input
            :disable="saving || labelBusy"
            v-model.number="customFoodDraft.caloriesKcal"
            type="number"
            min="0"
            :max="customFoodDraft.basis === 'per_serving' ? 5000 : 900"
            outlined
            :label="'Calories (kcal ' + customUnit + ')'"
          />
          <q-input
            :disable="saving || labelBusy"
            v-model.number="customFoodDraft.proteinG"
            type="number"
            min="0"
            :max="customFoodDraft.basis === 'per_serving' ? 1500 : 100"
            outlined
            :label="'Protein (g ' + customUnit + ')'"
          />
          <q-input
            :disable="saving || labelBusy"
            v-model.number="customFoodDraft.carbohydrateG"
            type="number"
            min="0"
            :max="customFoodDraft.basis === 'per_serving' ? 1500 : 100"
            outlined
            :label="'Carbs (g ' + customUnit + ')'"
          />
          <q-input
            :disable="saving || labelBusy"
            v-model.number="customFoodDraft.fatG"
            type="number"
            min="0"
            :max="customFoodDraft.basis === 'per_serving' ? 1500 : 100"
            outlined
            :label="'Fat (g ' + customUnit + ')'"
          />
          <q-input
            :disable="saving || labelBusy"
            v-model.number="customFoodDraft.fiberG"
            type="number"
            min="0"
            :max="customFoodDraft.basis === 'per_serving' ? 1500 : 100"
            outlined
            :label="'Fiber (g ' + customUnit + ', optional)'"
          />
          <q-input
            :disable="saving || labelBusy"
            v-model.number="customFoodDraft.defaultServingGrams"
            type="number"
            min="1"
            max="3000"
            outlined
            label="Usual serving (g, optional)"
          />
          <q-input
            :disable="saving || labelBusy"
            v-model.number="customFoodDraft.sugarG"
            type="number"
            min="0"
            :max="customFoodDraft.basis === 'per_serving' ? 1500 : 100"
            outlined
            :label="'Sugar (g ' + customUnit + ', optional)'"
          /><q-input
            :disable="saving || labelBusy"
            v-model.number="customFoodDraft.sodiumMg"
            type="number"
            min="0"
            max="100000"
            outlined
            :label="'Sodium (mg ' + customUnit + ', optional)'"
          />
          <p v-if="foodError" class="inline-error" role="alert">{{ foodError }}</p>
          <p v-if="customQualityWarning" class="source-note">{{ customQualityWarning }}</p>
          <q-checkbox
            :disable="saving || labelBusy"
            v-if="labelMode || customFoodDraft.barcode"
            v-model="labelConfirmed"
            label="I checked the serving basis and every value against the label, including blank values."
          />
        </q-card-section>
        <q-card-actions align="right" class="dialog-actions"
          ><q-btn
            flat
            no-caps
            label="Cancel"
            :disable="saving"
            @click="customFoodDialog = false" /><q-btn
            unelevated
            no-caps
            color="primary"
            label="Save food"
            :loading="saving || labelBusy"
            :disable="
              labelBusy || ((labelMode || Boolean(customFoodDraft.barcode)) && !labelConfirmed)
            "
            @click="saveCustomFood"
        /></q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="manualBarcodeDialog" :persistent="barcodeBusy"
      ><q-card class="nutrition-dialog">
        <q-card-section
          ><h3>Enter a food barcode</h3>
          <q-select
            v-model="manualBarcodeFormat"
            emit-value
            map-options
            :options="[
              { label: 'EAN / UPC-A', value: '' },
              { label: 'UPC-E (8 digits)', value: 'UPC_E' },
            ]"
            outlined
            label="Barcode type"
          /><q-input
            v-model="manualBarcode"
            outlined
            inputmode="numeric"
            maxlength="14"
            label="Digits below the barcode"
            autofocus
            @keyup.enter="submitManualBarcode"
          />
          <p v-if="barcodeError" class="inline-error" role="alert">
            {{ barcodeError }}
          </p></q-card-section
        >
        <q-card-actions align="right"
          ><q-btn
            flat
            no-caps
            label="Cancel"
            :disable="barcodeBusy"
            @click="manualBarcodeDialog = false" /><q-btn
            unelevated
            color="primary"
            no-caps
            label="Look up product"
            :loading="barcodeBusy"
            @click="submitManualBarcode"
        /></q-card-actions> </q-card
    ></q-dialog>

    <div
      v-if="barcodeScanActive"
      class="barcode-scanner-modal"
      role="dialog"
      aria-label="Barcode scanner"
    >
      <div class="barcode-scanner-card">
        <strong>Scan a food barcode</strong>
        <span>Hold one barcode steady inside the frame until it is read twice.</span>
        <div class="barcode-scan-frame" aria-hidden="true"></div>
        <q-btn
          v-if="torchAvailable"
          outline
          no-caps
          :icon="torchEnabled ? 'flash_off' : 'flash_on'"
          :label="torchEnabled ? 'Torch off' : 'Torch on'"
          @click="toggleScannerTorch"
        />
        <p v-if="barcodeError" role="alert">{{ barcodeError }}</p>
        <q-btn outline no-caps label="Cancel scan" @click="cancelBarcodeScan" />
      </div>
    </div>
  </q-page>
</template>

<style scoped>
.nutrition-page {
  max-width: 1100px;
  margin: 0 auto;
  color: var(--text-primary);
}
.nutrition-source-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  font-size: 11px;
  color: var(--text-secondary);
}
.nutrition-source-badges > span {
  padding: 3px 7px;
  border: 1px solid var(--border-subtle);
  border-radius: 5px;
}
.nutrition-label-photo {
  width: 100%;
  max-height: 300px;
  object-fit: contain;
  border-radius: 8px;
}
.nutrition-label-text {
  max-height: 160px;
  overflow: auto;
  white-space: pre-wrap;
  font-size: 12px;
}
.nutrition-heading,
.section-heading,
.daily-card-top,
.energy-line,
.water-main,
.meal-card-heading,
.meal-entry,
.dialog-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}
.nutrition-heading {
  margin: 8px 0 26px;
}
.nutrition-heading h2 {
  margin: 2px 0;
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 36px;
  line-height: 1;
  font-weight: 800;
}
.heading-copy,
.source-note {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.55;
}
.macro-caption {
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
}
.heading-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.date-input {
  min-width: 185px;
}
.daily-card,
.water-card,
.food-search-section,
.meal-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}
.daily-card {
  padding: 24px;
  background: var(--bg-surface);
}
.daily-card-top {
  align-items: flex-start;
}
.daily-card-top h3,
.section-heading h3,
.water-info h3 {
  margin: 5px 0 0;
  font-size: 20px;
  font-weight: 800;
}
.energy-line {
  justify-content: flex-start;
  align-items: center;
  gap: 44px;
  margin: 22px 0 16px;
}
.energy-total,
.energy-target {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.energy-value {
  font-size: 24px;
  font-weight: 800;
  line-height: 1.1;
}
.energy-value small {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}
.energy-label,
.energy-target span,
.macro-goal {
  color: var(--text-secondary);
  font-size: 12px;
}
.energy-target strong {
  font-size: 16px;
}
.energy-progress {
  margin-bottom: 22px;
}
.macro-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.macro-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 76px;
  padding: 8px 13px;
  border-left: 1px solid var(--border-subtle);
}
.macro-card strong {
  font-size: 19px;
  line-height: 1;
}
.macro-card strong small {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
}
.water-card {
  margin: 14px 0 30px;
  padding: 17px 20px;
}
.water-main {
  margin-bottom: 14px;
}
.water-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex: none;
  color: var(--accent-primary);
  background: var(--accent-surface);
  border-radius: 50%;
}
.water-info {
  flex: 1;
}
.water-info h3 {
  font-size: 16px;
}
.water-info p {
  margin: 2px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}
.water-info strong {
  color: var(--text-primary);
}
.water-actions {
  display: flex;
  gap: 8px;
}
.water-history {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 12px;
}
.water-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 11px;
}
.water-pill button {
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  color: var(--text-secondary);
  background: none;
  cursor: pointer;
}
.food-search-section {
  padding: 22px;
}
.section-heading {
  margin-bottom: 15px;
}
.food-search-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 7px;
}
.meal-photo-input {
  display: none;
}
.meal-photo-staged {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 0;
  padding: 8px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-surface-elevated);
}
.meal-photo-staged img {
  width: 54px;
  height: 54px;
  flex: none;
  object-fit: cover;
  border-radius: 8px;
}
.meal-photo-staged div {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.meal-photo-staged strong {
  font-size: 13px;
}
.meal-photo-staged span {
  color: var(--text-secondary);
  font-size: 12px;
}
.section-heading h3 {
  margin-top: 3px;
}
.quick-searches {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 9px 0 12px;
}
.quick-searches button,
.portion-buttons button {
  padding: 6px 11px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface-elevated);
  color: var(--text-secondary);
  border-radius: 999px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.quick-searches button:hover,
.portion-buttons button:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}
.food-results {
  display: grid;
  gap: 7px;
  max-height: 430px;
  overflow: auto;
}
.food-result {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 65px;
  padding: 10px 13px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface-elevated);
  color: var(--text-primary);
  text-align: left;
  border-radius: var(--radius-md);
  cursor: pointer;
}
.food-result:hover {
  border-color: var(--accent-border);
  background: var(--accent-surface);
}
.food-menu-image {
  width: 54px;
  height: 54px;
  flex: none;
  object-fit: cover;
  border-radius: 8px;
}
@media (max-width: 600px) {
  .food-search-section > .section-heading {
    flex-wrap: wrap;
  }
  .food-search-section > .section-heading h3 {
    flex: 0 0 100%;
  }
  .food-search-actions {
    justify-content: flex-start;
  }
  .food-result {
    gap: 8px;
  }
  .food-result-kcal {
    min-width: 66px;
  }
}
.food-result-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}
.food-result-main strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
}
.food-result-main small,
.food-result-kcal small {
  color: var(--text-secondary);
  font-size: 11px;
}
.food-result-kcal {
  min-width: 105px;
  text-align: right;
  font-size: 14px;
  font-weight: 800;
}
.food-result-kcal small {
  display: block;
  font-weight: 500;
}
.food-add-icon {
  color: var(--accent-primary);
}
.catalog-empty,
.catalog-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px 12px;
  color: var(--text-secondary);
  text-align: center;
  font-size: 13px;
}
.food-skeleton {
  border-radius: var(--radius-md);
}
.catalog-empty p {
  margin: 0;
}
.catalog-error {
  justify-content: space-between;
  color: var(--danger-primary);
}
.source-note {
  font-size: 11px;
}
.meal-sections {
  margin: 30px 0;
}
.meal-heading {
  margin-bottom: 13px;
}
.meal-count {
  color: var(--text-secondary);
  font-size: 12px;
}
.meal-card {
  margin: 9px 0;
  padding: 3px 18px;
}
.meal-card-heading {
  min-height: 58px;
}
.meal-card-heading h4 {
  margin: 0;
  font-size: 15px;
}
.meal-card-heading span {
  color: var(--text-secondary);
  font-size: 11px;
}
.meal-empty {
  margin: 0;
  padding: 0 0 16px;
  color: var(--text-muted);
  font-size: 12px;
}
.meal-entries {
  border-top: 1px solid var(--border-subtle);
}
.meal-entry {
  min-height: 65px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-subtle);
}
.meal-entry:last-child {
  border-bottom: 0;
}
.meal-entry-main,
.meal-entry-values {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.meal-entry-main {
  flex: 1;
  min-width: 0;
}
.meal-entry-photo {
  width: 58px;
  height: 58px;
  flex: none;
  object-fit: cover;
  border-radius: 9px;
}
.meal-entry-main strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
}
.meal-entry-main span,
.meal-entry-values span {
  color: var(--text-secondary);
  font-size: 10px;
}
.meal-entry-values {
  align-items: flex-end;
  text-align: right;
}
.meal-entry-values strong {
  font-size: 12px;
}
.nutrition-dialog {
  width: min(560px, calc(100vw - 28px));
  max-width: 560px;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}
.dialog-heading {
  padding-bottom: 6px;
}
.dialog-heading h3 {
  max-width: 410px;
  margin: 4px 0 0;
  font-size: 19px;
  line-height: 1.3;
}
.dialog-body,
.goal-form {
  display: grid;
  gap: 14px;
}
.food-photo-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 2px 0;
}
.food-photo-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-surface-elevated);
}
.food-photo-preview img {
  width: 72px;
  height: 72px;
  flex: none;
  object-fit: cover;
  border-radius: 8px;
}
.barcode-scanner-card {
  display: grid;
  justify-items: center;
  gap: 15px;
  width: min(420px, calc(100vw - 32px));
  margin: 0 16px 30px;
  padding: 22px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 18px;
  color: #fff;
  background: rgba(13, 17, 20, 0.92) !important;
  text-align: center;
}
.barcode-scanner-card strong {
  font-size: 19px;
}
.barcode-scanner-card span {
  color: rgba(255, 255, 255, 0.75);
  font-size: 13px;
}
.barcode-scan-frame {
  width: min(280px, 78vw);
  height: 128px;
  border: 2px solid var(--accent-primary);
  border-radius: 14px;
  box-shadow: 0 0 0 999px rgba(0, 0, 0, 0.08);
}
.dialog-source {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
}
.dialog-heading .dialog-source {
  margin-top: 4px;
}
.portion-row {
  display: grid;
  grid-template-columns: minmax(100px, 150px) 1fr;
  align-items: center;
  gap: 12px;
}
.portion-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.portion-buttons button {
  border-radius: var(--radius-sm);
}
.estimate-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.estimate-grid div {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px;
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}
.estimate-grid span {
  color: var(--text-secondary);
  font-size: 10px;
}
.estimate-grid strong {
  font-size: 13px;
}
.dialog-actions {
  padding: 12px 20px 18px;
}
.goal-form {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.goal-form .source-note,
.goal-form .inline-error {
  grid-column: 1 / -1;
  margin: 0;
}
.inline-error {
  margin: 0 0 12px;
  padding: 10px 13px;
  border: 1px solid var(--danger-primary);
  border-radius: var(--radius-md);
  color: var(--danger-primary);
  background: var(--bg-surface);
  font-size: 13px;
}
.inline-success {
  margin: 0 0 12px;
  padding: 10px 13px;
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-md);
  color: var(--accent-primary);
  background: var(--accent-surface);
  font-size: 13px;
}
@media (max-width: 640px) {
  .nutrition-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 14px;
  }
  .heading-actions {
    width: 100%;
  }
  .date-input {
    flex: 1;
  }
  .daily-card,
  .food-search-section {
    padding: 17px;
  }
  .daily-card-top h3 {
    font-size: 16px;
  }
  .energy-line {
    gap: 25px;
  }
  .macro-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .water-card {
    padding: 15px;
  }
  .water-main {
    flex-wrap: wrap;
    gap: 10px;
  }
  .water-info {
    min-width: calc(100% - 60px);
  }
  .water-actions {
    width: 100%;
  }
  .water-actions :deep(.q-btn) {
    flex: 1;
  }
  .food-result {
    gap: 8px;
    padding: 9px;
  }
  .food-result-kcal {
    min-width: 80px;
    font-size: 12px;
  }
  .food-result-main strong {
    font-size: 12px;
  }
  .food-result-main small {
    font-size: 10px;
  }
  .meal-card {
    padding: 3px 12px;
  }
  .meal-entry {
    gap: 7px;
  }
  .meal-entry-values {
    max-width: 125px;
  }
  .meal-entry-values span {
    font-size: 9px;
  }
  .portion-row {
    grid-template-columns: 1fr;
  }
  .estimate-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .goal-form {
    grid-template-columns: 1fr;
  }
  .goal-form .source-note,
  .goal-form .inline-error {
    grid-column: auto;
  }
}
</style>

# Nutrition scanner and Philippine data upgrade

Based on the user-supplied “Nutrition App Barcode Scanner Upgrade Prompt + PH Macro Data.md”, November 13, 2026.

## Scanner and label workflow

- Android keeps the existing native ML Kit scanner with rear camera, 1280 × 720 capture, supported EAN-8/EAN-13/UPC-A/UPC-E formats, torch availability, and scan error cleanup.
- Check digits are validated before lookup. UPC-A is normalized to EAN-13 and UPC-E expands to its full canonical key. The live scanner requires two consecutive identical valid reads; manual and photo entry remain available.
- Product lookup checks this account's confirmed labels, then global catalogue data and the 24-hour Open Food Facts cache. Expired entries refresh in place. A bounded 503 retry uses exponential backoff, and outbound requests are throttled and coalesced per barcode.
- Missing or incomplete products open a private label-entry form. Android can photograph or choose a Nutrition Facts panel and read its text with the bundled ML Kit Latin model. Every field and the nutrition basis require user review before a label entry can be saved. OCR does not infer missing values. Temporary native image files are deleted after reading.
- This workflow uses no paid service or vision API key. Data from Open Food Facts (ODbL) is visibly attributed. An optional OPEN_FOOD_FACTS_USER_AGENT environment value can specify an app contact email; the default identifies the existing LiftUp website without inventing a contact address.

## Data and duplicate prevention

The CSV is `backend-express/src/data/ph_foods_seed.csv`: 34 records, consisting of 25 McDo rows, five Jollibee estimates, and four supplied PhilFCT generic foods. Twenty McDo rows retain official-source confidence after direct product-to-panel matching and the calorie sanity check. Remaining rows carry estimates/review notes. The source page HTML was retrieved and each McDo product's `data-target` nutrition link was matched explicitly, including at least five independent product checks. PhilFCT values from the supplied document remain flagged pending direct source verification.

Migration 015 adds barcode, canonical identity, source details, scoped uniqueness, nullable unknown macro values, serving-count logs, and import release tracking. A database constraint ties each identity scope to its owning account; global foods use scope zero. The database allows at most one barcode and canonical identity within each scope. Private foods never become public contributions automatically.

Imported foods are identified by chain and normalized item name. Earlier matching Burger McDo, Chicken McDo with rice, Fries, Yumburger, and Jolly Spaghetti records are updated in place; historical food-log snapshots remain unchanged. Repeated identical CSV imports are skipped by content hash. Changed imports update existing IDs. Equivalent older USDA McDonald’s records are archived when a matching PH menu item exists. Restaurant-name searches show Philippine menu data, keeping the older US market entries out of those menus. Different portions or combinations remain separate foods. Missing calories are rejected; missing macro values remain NULL and make the affected daily total incomplete.

Run the idempotent importer with `npm run db:seed-ph-foods` from backend-express. The catalogue also imports lazily through its existing initialization path.

## Checks and release

Targeted backend tests cover check digits, canonical UPC aliases, source confidence, Atwater checks, the mocked 4807770273698 fixture, 503 retries, cache expiry, account label priority, private barcode isolation, serving math, repeated imports, and unchanged historical logs. Frontend tests cover canonicalization, stable reads, and conservative label parsing.

Commands:

```
cd backend-express
node --test test/nutrition-quality.test.js test/nutrition-features.test.js
```

```
cd frontend
npm test
npm run typecheck
npm run build:android
```

Real PostgreSQL verification uses a generated `gymtracker_test_*` schema and removes that schema afterward. The live application schema is updated only on deployment.

Android version 1.0.5 (code 6) adds the native OCR plugin. Install this APK for the new scanner and label-reading controls. The live server update supplies the extended catalogue and product API.

## Primary references

- https://mcdonalds.com.ph/our-food/burgers
- https://mcdonalds.com.ph/our-food/chicken-platters
- https://mcdonalds.com.ph/our-food/fries
- https://mcdonalds.com.ph/our-food/breakfast
- https://mcdonalds.com.ph/our-food/drinks-desserts
- https://openfoodfacts.github.io/openfoodfacts-server/api/
- https://capawesome.io/docs/sdks/capacitor/mlkit/barcode-scanning/
- https://developers.google.com/ml-kit/vision/text-recognition/v2

## Verification evidence (13 November 2026)

- All 129 frontend tests passed; the three barcode/label-parser tests were also repeated after the picker change. Type checking and targeted lint passed.
- All six backend nutrition tests passed. The PostgreSQL integration check passed in an isolated schema and cleaned it up.
- Native Android 1.0.5 built and installed successfully on the Samsung A73. Direct native OCR and the label parsing pipeline read the sample label correctly. After reconnecting, the actual native picker and in-app label flow passed: all eight expected values and the serving basis matched the test label, and confirmation stayed unchecked. The rear camera, torch, scanner cancellation, and barcode-photo decoding also passed.
- Live verification confirmed UPC/EAN saves reuse the same food ID, serving-based meal logging, and photo persistence. The temporary verification account was removed.

Final live audit: 34 imported PH records, 34 unique identities, zero duplicate identities or barcodes within a scope, and four archived US McDonald’s overlaps. Menus contain 26 McDo, six Jollibee, and three Mang Inasal entries; the phone also rendered 26 unique McDo results. Temporary sample images were removed. No sample meal or custom food was saved to the phone account.

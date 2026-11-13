# Restaurant menu database expansion

This is the database phase requested on 13 November 2026. It prepares individual menu records, nutrient details and image references for a later meal browser. It does not change the current Nutrition screen or add the expanded US menu to the existing Philippine quick search.

## Source coverage

- 112 Jollibee USA menu entries from all five pages of the official nutrition facts PDF dated 1 July 2026. The supplied PDF and official download have the same SHA-256: `58debbd062581d47d3185ac85350e3b34e43cb67ed8a5437a0460e5771a405f2`.
- 40 McDo menu entries transcribed from the two user-supplied guides. They provide calories and protein only. These remain estimates, with other nutrients unknown.
- 35 existing Philippine restaurant records are linked by their existing food IDs. Matching guide entries become alternate source observations for the same menu item. Verified existing values take priority over the guide. No existing food or meal-log values are rewritten.
- The final identity review keeps uncertain McCrispy recipe matches separate. Similar names alone are insufficient to merge different recipes.

With the current database this produces **176 distinct menu items**: 112 US Jollibee items and 64 Philippine items (55 McDo, six Jollibee and three Mang Inasal). Eleven McDo guide entries match existing products, leaving 187 source observations attached to 176 items. Different sizes, piece counts, family packs and combinations remain distinct.

## Storage and duplicate protection

Migration 016 adds three tables:

- `nutrition_menu_items`: one item per canonical brand, market, product and portion variant. Includes a unique identity, category, existing food link, primary source, serving basis, grams or millilitres, calories, protein, carbs, fat, fibre, sugar, sodium, saturated fat, trans fat, cholesterol, nutrient bounds, image reference and review notes.
- `nutrition_menu_sources`: the source type, market, URL, publication/retrieval dates and file hash.
- `nutrition_menu_observations`: original source names, PDF page numbers, nutrients, serving labels, images and notes. A unique source/item key prevents repeat imports from duplicating observations.

The importer updates matching records in place. Existing item IDs and creation dates survive repeated imports. US and PH values have different identities. A US Yumburger does not replace a Philippine Yumburger.

`<1 g` sugar is retained as a bound with an unknown exact numeric value, rather than being changed to zero or one. Drink millilitres are not treated as grams. Family and party pack figures apply to the complete published pack. Published ounce/gram inconsistencies and calorie/macro discrepancies are flagged; source numbers remain unchanged.

## Images

Every item has an image reference and a caption describing its accuracy. All 78 distinct external image URLs returned successful image responses during verification.

- Official product photographs come from the official McDo PH and Jollibee US product pages. Where only another size or meal configuration is pictured, the image is explicitly marked representative.
- Supplied guide files are copied unchanged into `frontend/public/images/menu-catalog`. Individual meal records reference only the food-photo region through `region: {x,y,width,height}`, with original image dimensions. The future renderer must display that region, never the entire menu guide as a meal image.
- Small add-ons without a suitable official product photo use clearly labeled ingredient illustrations. Existing Mang Inasal records retain their labeled meal illustrations. Images never determine nutrient values.

## Commands

From `backend-express`:

```
npm run db:seed-restaurant-menus -- --dry-run
npm run db:seed-restaurant-menus
node --test test/nutrition-menu-catalog.test.js test/nutrition-quality.test.js
```

The dry run uses a read-only database connection and does not apply migrations. The import applies migration 016 through the normal database opener, then writes the catalogue in a transaction. A fresh verified database backup was made before the live import.

## Next UI phase

Use a spacious restaurant meal list with market, restaurant and category filters, pagination, individual images and a separate detail view on selection. Show the selected portion, all available nutrients, source/confidence, unknown values and source differences. The current compact quick-search panel is not the intended browser for all these entries. Resolve or link a catalogue item to its logging food only when adding it to the tracker; the imported database catalogue itself does not create duplicate logging foods.

## Primary sources

- https://www.jollibeefoods.com/nutrition
- https://jollibee-prod-media.s3.us-west-2.amazonaws.com/20260701_JB_USA_Nutrition_Facts_2026_Mktg_8f037d9d5d.pdf
- https://www.jollibeefoods.com/menu
- https://mcdonalds.com.ph/our-food/burgers
- https://mcdonalds.com.ph/our-food/chicken-platters
- https://mcdonalds.com.ph/our-food/fries
- https://mcdonalds.com.ph/our-food/breakfast
- https://mcdonalds.com.ph/our-food/drinks-desserts

## Live verification completed 14 November 2026

- Release `f4afdc3` deployed successfully. Health check and hosted source-image/illustration requests returned HTTP 200 with image content types. All 78 distinct external image URLs also passed verification.
- Initial live import inserted 176 items. Repeat import inserted zero items; all 176 IDs and creation dates remained stable. There are 187 source observations, zero duplicate item identities and zero duplicate source/item references.
- Every item has an image reference. Brand/market counts are McDo PH 55, Jollibee PH six, Mang Inasal PH three and Jollibee US 112.
- Full-table checksums of the pre-existing nutrition foods and meal logs matched before and after both imports. A verified backup was retained under the private backend backups directory.
- Six targeted catalogue/quality tests passed. All three catalogue tests passed on real PostgreSQL in an isolated schema, which was removed afterward. Tests cover stable repeat imports, source priority, market separation, serving units, unknown values, nutrient bounds and image references.

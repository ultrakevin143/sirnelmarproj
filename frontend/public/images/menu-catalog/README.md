# Menu image references

The two `mcdo-guide-*.png` files are unchanged copies of the user-provided menu guides. Their filename suffixes are their SHA-256 prefixes. The database records individual food-photo regions from those sources; a meal image must render only its recorded region, not the whole guide.

The `ingredient-*.svg` files are simple, code-authored ingredient illustrations for records without suitable official photographs. They are not official brand photography and do not depict verified portions.

Official product-photo URLs and provenance are recorded in `backend-express/src/data/restaurant-menu-catalog.json`. Representative images are labeled as such when the pictured portion, preparation or included sides differ. Images have no role in calculating nutrient values.

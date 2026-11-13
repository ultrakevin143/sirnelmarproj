function validCheckDigit(code) {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  let sum = 0;
  for (
    let i = code.length - 2, weight = 3;
    i >= 0;
    i--, weight = weight === 3 ? 1 : 3
  )
    sum += Number(code[i]) * weight;
  return (10 - (sum % 10)) % 10 === Number(code.at(-1));
}

function normalizeBarcode(value, format = "") {
  if (typeof value !== "string") return null;
  let code = value.trim();
  if (/UPC.?E/i.test(format)) {
    if (!/^[01]\d{7}$/.test(code)) return null;
    const [ns, a, b, c, d, e, f, check] = code;
    if ("012".includes(f)) code = ns + a + b + f + "0000" + c + d + e + check;
    else if (f === "3") code = ns + a + b + c + "00000" + d + e + check;
    else if (f === "4") code = ns + a + b + c + d + "00000" + e + check;
    else code = ns + a + b + c + d + e + "0000" + f + check;
  }
  if (!validCheckDigit(code)) return null;
  return code.length === 12 ? "0" + code : code;
}

function atwaterCheck(nutrients) {
  const {
    caloriesKcal: kcal,
    proteinG: p,
    carbohydrateG: c,
    fatG: f,
  } = nutrients;
  if (
    [kcal, p, c, f].some(
      (value) => value == null || !Number.isFinite(value) || value < 0,
    )
  )
    return { needsReview: true, reason: "Some nutrition values are missing." };
  const calculatedKcal = 4 * p + 4 * c + 9 * f;
  const difference = Math.abs(calculatedKcal - kcal);
  // Very low calorie labels can round grams to zero.
  const needsReview = difference > Math.max(2, kcal * 0.1);
  return {
    needsReview,
    calculatedKcal: Math.round(calculatedKcal * 10) / 10,
    reason: needsReview
      ? "Calories and macros differ by more than 10%. Check the source label."
      : null,
  };
}

function canonicalFoodName(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/mcdonald[’']?s(?: philippines| ph)?|mcdo\b/g, "mcdo")
    .replace(/jollibee(?: philippines| ph)?/g, "jollibee")
    .replace(/\(estimate\)/g, "")
    .replace(/\b1[ -]?pc\b/g, "1 pc")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("Unclosed CSV field.");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift();
  return rows.map((values) =>
    Object.fromEntries(headers.map((key, i) => [key, values[i] ?? ""])),
  );
}

module.exports = {
  validCheckDigit,
  normalizeBarcode,
  atwaterCheck,
  canonicalFoodName,
  parseCsv,
};

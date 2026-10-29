/** Parse displayed currency into integer minor units without floating-point equality. */
export function cents(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  let text = String(value).trim();
  const negative = /^\(.*\)$/.test(text);
  text = text
    .replace(/[()\s\u00a0]/g, "")
    .replace(/^(ZAR|USD|EUR|GBP|R|\$|€|£)/i, "");
  if (!/^-?[\d.,]+$/.test(text)) return null;
  if (text.includes(",") && text.includes(".")) text = text.replaceAll(",", "");
  else if (text.includes(",")) {
    if (/^-?\d{1,3}(,\d{3})+$/.test(text)) text = text.replaceAll(",", "");
    else text = text.replace(",", ".");
  }
  if (!/^-?\d+(\.\d{1,6})?$/.test(text)) return null;
  const sign = negative || text.startsWith("-") ? -1 : 1;
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const amount =
    BigInt(whole) * 100n +
    BigInt((fraction + "00").slice(0, 2)) +
    (Number(fraction[2] ?? 0) >= 5 ? 1n : 0n);
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return sign * Number(amount);
}
export function normalise(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-ZA");
}
export function sameValue(a: unknown, b: unknown, kind = "text"): boolean {
  if (kind === "money") {
    const x = cents(a),
      y = cents(b);
    return x !== null && y !== null && Math.abs(x - y) <= 1;
  }
  if (kind === "number") {
    const x = Number(a),
      y = Number(b);
    return (
      a !== "" &&
      b !== "" &&
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      Math.abs(x - y) < 0.000001
    );
  }
  if (kind === "boolean")
    return typeof a === "boolean" && typeof b === "boolean" && a === b;
  return normalise(a) !== "" && normalise(a) === normalise(b);
}

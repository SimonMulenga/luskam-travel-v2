export const MAX_QUOTATION_TOTAL_CENTS = 99_999_999_999_999n;

export type FlightQuotationAmountItem = { quantity: string; unitAmountZmw: string };

function scaledInteger(value: string, maxWhole: number): bigint | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  if (Number(whole) > maxWhole) return null;
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

/** Mirrors the database's positive numeric(2 decimal) line rounding with integer cents. */
export function calculateFlightQuotationTotalCents(items: FlightQuotationAmountItem[]): bigint | null {
  if (items.length < 1 || items.length > 100) return null;
  let total = 0n;
  for (const item of items) {
    const quantityHundredths = scaledInteger(item.quantity, 100_000);
    const unitCents = scaledInteger(item.unitAmountZmw, 9_999_999);
    if (quantityHundredths === null || quantityHundredths < 1n || quantityHundredths > 10_000_000n
      || unitCents === null || unitCents > 999_999_999n) return null;
    const lineCents = (quantityHundredths * unitCents + 50n) / 100n;
    total += lineCents;
    if (total > MAX_QUOTATION_TOTAL_CENTS) return null;
  }
  return total;
}

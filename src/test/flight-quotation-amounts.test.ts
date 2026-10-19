import { describe, expect, it } from "vitest";
import { calculateFlightQuotationTotalCents, MAX_QUOTATION_TOTAL_CENTS } from "@/lib/flightQuotationAmounts";

describe("flight quotation amount boundaries", () => {
  it("accepts the maximum quantity and unit amount while keeping the line within numeric(14,2)", () => {
    expect(calculateFlightQuotationTotalCents([{ quantity: "100000.00", unitAmountZmw: "9999999.99" }]))
      .toBe(99_999_999_900_000n);
  });

  it("accepts the maximum quotation aggregate and rejects an excessive sum", () => {
    const exact = calculateFlightQuotationTotalCents([
      { quantity: "100000.00", unitAmountZmw: "9999999.99" },
      { quantity: "0.01", unitAmountZmw: "99999.00" },
    ]);
    expect(exact).toBe(MAX_QUOTATION_TOTAL_CENTS);
    expect(calculateFlightQuotationTotalCents([
      { quantity: "100000.00", unitAmountZmw: "9999999.99" },
      { quantity: "0.01", unitAmountZmw: "100000.00" },
    ])).toBeNull();
  });

  it("rejects over-precision, over-range, and more than 100 items", () => {
    expect(calculateFlightQuotationTotalCents([{ quantity: "1.001", unitAmountZmw: "10.00" }])).toBeNull();
    expect(calculateFlightQuotationTotalCents([{ quantity: "100000.01", unitAmountZmw: "1.00" }])).toBeNull();
    expect(calculateFlightQuotationTotalCents(Array.from({ length: 101 }, () => ({ quantity: "1", unitAmountZmw: "1" })))).toBeNull();
  });
});

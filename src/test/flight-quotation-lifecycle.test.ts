import { describe, expect, it } from "vitest";
import { canAdvanceFlightBooking, isFlightQuotationCurrentlyValid, isFlightQuotationPastDue } from "@/lib/flightQuotationLifecycle";

describe("flight quotation lifecycle guards", () => {
  it("matches the approved booking status transitions", () => {
    expect(canAdvanceFlightBooking("booking_requested", "processing")).toBe(true);
    expect(canAdvanceFlightBooking("processing", "awaiting_supplier_confirmation")).toBe(true);
    expect(canAdvanceFlightBooking("awaiting_supplier_confirmation", "confirmed_ticket_issued")).toBe(true);
    expect(canAdvanceFlightBooking("confirmed_ticket_issued", "completed")).toBe(true);
    expect(canAdvanceFlightBooking("booking_requested", "confirmed_ticket_issued")).toBe(false);
    expect(canAdvanceFlightBooking("completed", "processing")).toBe(false);
  });

  it("treats expiry as a strict 24-hour boundary and fails closed on invalid values", () => {
    const expires = "2099-11-10T10:00:00.000Z";
    const expiryMs = Date.parse(expires);
    expect(isFlightQuotationCurrentlyValid("issued", expires, expiryMs - 1)).toBe(true);
    expect(isFlightQuotationCurrentlyValid("issued", expires, expiryMs)).toBe(false);
    expect(isFlightQuotationPastDue("issued", expires, expiryMs)).toBe(true);
    expect(isFlightQuotationCurrentlyValid("accepted", expires, expiryMs - 1)).toBe(false);
    expect(isFlightQuotationPastDue("issued", "invalid", expiryMs)).toBe(false);
    expect(isFlightQuotationCurrentlyValid("issued", null, expiryMs)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { hasClientControlledFields, isStrictCalendarDate, isUuid, passengerTypesMatch, quoteMatchesCurrent, sanitizeInquiryDetails, unpricedBookingDefaults } from "../../supabase/functions/create-booking-request/validation";
import { applyPricingRule, requirePricingRule } from "../../supabase/functions/_shared/pricingCore";
import { bookingCorsHeaders, isAllowedBookingOrigin } from "../../supabase/functions/create-booking-request/http";

describe("trusted booking boundary", () => {
  it.each(["user_id", "owner_id", "role", "total_amount", "price", "supplier_price", "markup_amount", "currency", "status", "booking_status", "payment_status", "ticket_status", "ticket_number", "pnr", "reference", "provider_offer_id", "provider_booking_reference"])("rejects client-controlled %s fields", (field) => {
    expect(hasClientControlledFields({ operation: "service_inquiry", [field]: field === "total_amount" ? 1 : "forged" })).toBe(true);
  });

  it("allows a candidate offer reference only as an untrusted lookup key", () => {
    expect(hasClientControlledFields({ operation: "quote", providerReference: "offer-candidate" })).toBe(false);
  });

  it("rejects expired or altered quote claims and accepts a current exact match", () => {
    const quote = { uid: "customer-a", exp: 2000, nonce: "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1", providerReference: "fare-1", query: { origin: "LUN", destination: "JNB" }, pricing: { customer_price: 540 }, currency: "USD" };
    expect(quoteMatchesCurrent(quote, quote, 1999)).toBe(true);
    expect(quoteMatchesCurrent(quote, quote, 2001)).toBe(false);
    expect(quoteMatchesCurrent(quote, { ...quote, uid: "customer-b" }, 1999)).toBe(false);
    expect(quoteMatchesCurrent(quote, { ...quote, nonce: "b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1" }, 1999)).toBe(false);
    expect(quoteMatchesCurrent(quote, { ...quote, pricing: { customer_price: 1 } }, 1999)).toBe(false);
  });

  it("checks passenger types against the search counts", () => {
    const counts = { adults: 1, children: 1, infants: 0 };
    expect(passengerTypesMatch([{ type: "Adult" }, { type: "Child" }], counts)).toBe(true);
    expect(passengerTypesMatch([{ type: "Adult" }, { type: "Adult" }], counts)).toBe(false);
  });

  it("persists schedule and service requests as unpriced pending inquiries", () => {
    expect(unpricedBookingDefaults("flight")).toEqual({ total_amount: 0, currency: "USD", status: "pending", payment_status: "pending" });
    expect(unpricedBookingDefaults("kakande")).toEqual({ total_amount: 0, currency: "ZMW", status: "pending", payment_status: "pending" });
  });

  it("removes local price estimates and client statuses from inquiry details", () => {
      expect(sanitizeInquiryDetails({ name: "Example stay", city: "Lusaka", hotelId: "sample-1", pricePerNight: 125, total_amount: 500, currency: "USD", status: "confirmed", ticket_number: "FAKE", pnr: "FAKE", provider_reference: "forged", guests: 2 }, "hotel")).toEqual({ name: "Example stay", hotelId: "sample-1", city: "Lusaka" });
  });

  it("keeps only fields supported by each service inquiry", () => {
    expect(sanitizeInquiryDetails({ country: "Zambia", visaType: "Tourist", passport: "SYNTHETIC", ticket_number: "FAKE", payment_status: "paid" }, "visa"))
      .toEqual({ country: "Zambia", visaType: "Tourist", passport: "SYNTHETIC" });
    expect(sanitizeInquiryDetails({ trip: "July", travellers: "1", notes: "Please call", providerReference: "forged" }, "kakande"))
      .toEqual({ trip: "July", travellers: "1", notes: "Please call" });
  });

  it("accepts only strict calendar dates and canonical v4 UUIDs", () => {
    expect(isStrictCalendarDate("2028-02-29")).toBe(true);
    expect(isStrictCalendarDate("2027-02-29")).toBe(false);
    expect(isStrictCalendarDate("2027-13-01")).toBe(false);
    expect(isUuid("a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1")).toBe(true);
    expect(isUuid("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
    expect(isUuid("a1a1a1a1-a1a1-11a1-11a1-a1a1a1a1a1a1")).toBe(false);
  });

  it("allows only configured browser origins and returns correct preflight headers", () => {
    const staging = new Request("https://edge.example/functions/v1/create-booking-request", { headers: { Origin: "https://staging.example" } });
    const headers = bookingCorsHeaders(staging);
    expect(isAllowedBookingOrigin(staging)).toBe(false);
    expect(isAllowedBookingOrigin(staging, "https://staging.example")).toBe(true);
    expect(bookingCorsHeaders(staging, "https://staging.example")).toMatchObject({
      "Access-Control-Allow-Origin": "https://staging.example",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    });
    const unconfigured = new Request("https://edge.example/functions/v1/create-booking-request", { headers: { Origin: "https://unconfigured.example" } });
    expect(isAllowedBookingOrigin(unconfigured)).toBe(false);
    expect(isAllowedBookingOrigin(unconfigured, "https://unconfigured.example/path")).toBe(false);
  });

  it("applies the server pricing rule to the authoritative supplier fare", () => {
    const rule = { id: "rule-1", name: "Default markup", rule_type: "global", priority: 0, markup_type: "percentage" as const, markup_amount: 12.5, currency: "USD", airline_code: null, origin_airport: null, destination_airport: null, cabin_class: null, is_domestic: null, min_ticket_price: null, max_ticket_price: null, valid_from: null, valid_until: null, is_active: true };
    expect(applyPricingRule(rule, { supplierPrice: 400 })).toEqual({ supplier_price: 400, markup_amount: 50, customer_price: 450, pricing_rule_id: "rule-1", pricing_rule_name: "Default markup" });
  });

  it("fails closed when no active pricing rule matches", () => {
    expect(() => requirePricingRule(null)).toThrow(/approved pricing rule is required/i);
  });
});

export const FLIGHT_BOOKING_TRANSITIONS: Record<string, readonly string[]> = {
  booking_requested: ["processing", "cancelled", "unable_to_fulfil"],
  processing: ["awaiting_supplier_confirmation", "cancelled", "unable_to_fulfil"],
  awaiting_supplier_confirmation: ["confirmed_ticket_issued", "cancelled", "unable_to_fulfil"],
  confirmed_ticket_issued: ["completed", "cancelled"],
};

export function canAdvanceFlightBooking(current: string, next: string): boolean {
  return FLIGHT_BOOKING_TRANSITIONS[current]?.includes(next) ?? false;
}

export function isFlightQuotationCurrentlyValid(status: string, validUntil: string | null, now = Date.now()): boolean {
  if (status !== "issued" || !validUntil) return false;
  const expiration = Date.parse(validUntil);
  return Number.isFinite(expiration) && expiration > now;
}

export function isFlightQuotationPastDue(status: string, validUntil: string | null, now = Date.now()): boolean {
  if (status !== "issued" || !validUntil) return false;
  const expiration = Date.parse(validUntil);
  return Number.isFinite(expiration) && expiration <= now;
}

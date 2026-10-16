import { supabase } from "@/integrations/supabase/client";

export type BookingType = "flight" | "hotel" | "car" | "visa" | "kakande" | "package" | "transfer" | "insurance";

/** Creates an unpriced service inquiry. Flight pricing uses the dedicated quote flow in Checkout. */
export interface CreateBookingInput {
  type: Exclude<BookingType, "flight">;
  travel_date?: string | null;
  details: Record<string, unknown>;
}

export const createBooking = async (input: CreateBookingInput) => {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) throw new Error("You must be signed in to submit this request.");

  const idempotencyStorageKey = "luskam.service-inquiry.idempotency";
  const idempotencyKey = sessionStorage.getItem(idempotencyStorageKey) || crypto.randomUUID();
  sessionStorage.setItem(idempotencyStorageKey, idempotencyKey);
  const { data, error } = await supabase.functions.invoke("create-booking-request", {
    body: {
      operation: "service_inquiry",
      idempotencyKey,
      type: input.type,
      travelDate: input.travel_date ?? null,
      details: input.details,
    },
  });
  if (error) throw error;
  if (!data?.booking) throw new Error(data?.error ?? "Could not save your request.");
  if (sessionStorage.getItem(idempotencyStorageKey) === idempotencyKey) sessionStorage.removeItem(idempotencyStorageKey);
  return data.booking;
};

export interface FlightRequestData {
  search: { origin: string; destination: string; departureDate: string; returnDate: string | null; cabin: string; passengers: { adults: number; children: number; infants: number } };
  providerReference: string;
  passengers: Array<{ type: string; title: string; firstName: string; lastName: string }>;
  contact: { email: string; phone: string };
}

export async function quoteFlightRequest(request: Pick<FlightRequestData, "search" | "providerReference">) {
  const { data, error } = await supabase.functions.invoke("create-booking-request", { body: { operation: "quote", ...request } });
  if (error) throw error;
  if (!data?.quoteToken) throw new Error(data?.error ?? "Could not confirm the current fare.");
  return data as { quoteToken: string; amount: number; currency: string; expiresAt: string };
}

export async function submitFlightRequest(request: FlightRequestData & { quoteToken?: string; idempotencyKey: string; scheduleOnly: boolean }) {
  const { scheduleOnly, ...flight } = request;
  const body = scheduleOnly
    ? { operation: "schedule_inquiry", idempotencyKey: request.idempotencyKey, search: flight.search, details: { route: flight.search.origin + "-" + flight.search.destination } }
    : { operation: "submit_flight", ...flight };
  const { data, error } = await supabase.functions.invoke("create-booking-request", { body });
  if (error) throw error;
  if (!data?.booking) throw new Error(data?.error ?? "Could not submit your booking request.");
  return data.booking;
}

// Used only for an unpersisted WhatsApp inquiry shown before account submission.
export const generateReference = (prefix: string) => prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();

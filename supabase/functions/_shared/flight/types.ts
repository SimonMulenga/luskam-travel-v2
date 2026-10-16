// Provider-independent flight contracts.
// The rest of the system (edge functions, DB, frontend) only ever speaks this
// language. Swapping Aviationstack for a real booking provider means adding a
// new implementation of these interfaces — nothing else changes.

export type CabinClass = "economy" | "premium_economy" | "business" | "first";
export type TripType = "oneway" | "return" | "multicity";

export interface PassengerCounts {
  adults: number;
  children: number;
  infants: number;
}

export interface FlightSearchQuery {
  origin: string; // IATA
  destination: string; // IATA
  departureDate: string; // yyyy-MM-dd
  returnDate?: string | null;
  tripType: TripType;
  cabinClass: CabinClass;
  passengers: PassengerCounts;
}

/** Normalised internal result. `bookable` is false for pure aviation data. */
export interface FlightSearchResult {
  id: string;
  provider: string;
  providerReference: string | null;
  flightNumber: string | null;
  airline: string | null;
  airlineCode: string | null;
  aircraft: string | null;
  origin: string | null;
  originCode: string | null;
  destination: string | null;
  destinationCode: string | null;
  departureDateTime: string | null; // ISO
  arrivalDateTime: string | null; // ISO
  durationMinutes: number | null;
  stops: number;
  status: string | null;
  cabinClass: CabinClass;
  /** Only set when the provider returned a genuine bookable fare. */
  supplierPrice: number | null;
  markupAmount: number | null;
  customerPrice: number | null;
  currency: string | null;
  bookable: boolean;
  /** "flight_information" for schedule/status data, "offer" for real fares. */
  kind: "flight_information" | "offer";
}

export interface PassengerInput {
  type: "adult" | "child" | "infant";
  title?: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  nationality?: string;
  passportNumber?: string;
  passportExpiry?: string;
}

export interface CreateBookingRequest {
  offerId: string;
  passengers: PassengerInput[];
  contact: { email: string; phone?: string };
}

export type BookingStatus =
  | "SEARCHED"
  | "PRICE_PENDING"
  | "PRICE_CONFIRMED"
  | "PAYMENT_PENDING"
  | "PAYMENT_CONFIRMED"
  | "BOOKING_PENDING"
  | "BOOKED"
  | "TICKET_PENDING"
  | "TICKETED"
  | "CANCELLED"
  | "REFUNDED"
  | "FAILED";

export interface ProviderCapabilities {
  aviationData: boolean;
  liveInventory: boolean;
  livePricing: boolean;
  revalidation: boolean;
  booking: boolean;
  ticketing: boolean;
  cancellation: boolean;
  refunds: boolean;
  seatSelection: boolean;
  ancillaries: boolean;
}

export class ProviderNotSupported extends Error {
  code = "PROVIDER_ACTION_NOT_SUPPORTED";
  constructor(action: string, provider: string) {
    super(`${provider} does not support "${action}". A booking provider is not connected yet.`);
  }
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public code: string = "PROVIDER_ERROR",
    public status: number = 502,
  ) {
    super(message);
  }
}

/**
 * The service contract every flight provider implements. Data-only providers
 * (Aviationstack) throw ProviderNotSupported for the commercial methods.
 */
export interface FlightProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  searchFlights(query: FlightSearchQuery): Promise<FlightSearchResult[]>;
  getFlightOffer(offerId: string): Promise<FlightSearchResult>;
  revalidateOffer(offerId: string): Promise<FlightSearchResult>;
  createBooking(req: CreateBookingRequest): Promise<{ providerReference: string; pnr: string | null; status: BookingStatus }>;
  confirmBooking(providerReference: string): Promise<{ status: BookingStatus }>;
  getBooking(providerReference: string): Promise<{ status: BookingStatus; pnr: string | null }>;
  cancelBooking(providerReference: string): Promise<{ status: BookingStatus }>;
  refundBooking(providerReference: string): Promise<{ status: BookingStatus }>;
  issueTicket(providerReference: string): Promise<{ status: BookingStatus; ticketNumbers: string[] }>;
}

/** Shared base so data-only providers stay honest about what they can't do. */
export abstract class BaseFlightProvider implements FlightProvider {
  abstract readonly name: string;
  abstract readonly capabilities: ProviderCapabilities;

  abstract searchFlights(query: FlightSearchQuery): Promise<FlightSearchResult[]>;

  getFlightOffer(_offerId: string): Promise<FlightSearchResult> {
    throw new ProviderNotSupported("getFlightOffer", this.name);
  }
  revalidateOffer(_offerId: string): Promise<FlightSearchResult> {
    throw new ProviderNotSupported("revalidateOffer", this.name);
  }
  createBooking(_req: CreateBookingRequest): Promise<{ providerReference: string; pnr: string | null; status: BookingStatus }> {
    throw new ProviderNotSupported("createBooking", this.name);
  }
  confirmBooking(_ref: string): Promise<{ status: BookingStatus }> {
    throw new ProviderNotSupported("confirmBooking", this.name);
  }
  getBooking(_ref: string): Promise<{ status: BookingStatus; pnr: string | null }> {
    throw new ProviderNotSupported("getBooking", this.name);
  }
  cancelBooking(_ref: string): Promise<{ status: BookingStatus }> {
    throw new ProviderNotSupported("cancelBooking", this.name);
  }
  refundBooking(_ref: string): Promise<{ status: BookingStatus }> {
    throw new ProviderNotSupported("refundBooking", this.name);
  }
  issueTicket(_ref: string): Promise<{ status: BookingStatus; ticketNumbers: string[] }> {
    throw new ProviderNotSupported("issueTicket", this.name);
  }
}

export const CABINS: CabinClass[] = ["economy", "premium_economy", "business", "first"];

export function normalizeCabin(input?: string | null): CabinClass {
  const v = (input ?? "economy").toLowerCase().replace(/[\s-]+/g, "_");
  return (CABINS.includes(v as CabinClass) ? v : "economy") as CabinClass;
}

export function cabinLabel(c: CabinClass): string {
  return {
    economy: "Economy",
    premium_economy: "Premium Economy",
    business: "Business",
    first: "First",
  }[c];
}

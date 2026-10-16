// Placeholder for the real booking provider (APG / Travelport / other GDS or
// consolidator). It deliberately implements NOTHING: every commercial call
// reports a clear "booking provider not connected" state so the UI can never
// show a fake reservation, PNR or ticket.
import {
  BaseFlightProvider,
  type FlightSearchQuery,
  type FlightSearchResult,
  type ProviderCapabilities,
  ProviderError,
} from "./types.ts";

export const BOOKING_PROVIDER_NOT_CONNECTED = "BOOKING_PROVIDER_NOT_CONNECTED";

export class NotConnectedBookingProvider extends BaseFlightProvider {
  readonly name = "not_connected";
  readonly capabilities: ProviderCapabilities = {
    aviationData: false,
    liveInventory: false,
    livePricing: false,
    revalidation: false,
    booking: false,
    ticketing: false,
    cancellation: false,
    refunds: false,
    seatSelection: false,
    ancillaries: false,
  };

  searchFlights(_q: FlightSearchQuery): Promise<FlightSearchResult[]> {
    throw new ProviderError(
      "Online ticketing is being connected. Please contact our travel desk to complete this booking.",
      BOOKING_PROVIDER_NOT_CONNECTED,
      503,
    );
  }
}

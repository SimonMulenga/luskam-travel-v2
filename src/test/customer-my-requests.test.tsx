import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyRequests from "@/components/account/MyRequests";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock } }));

const flightRequest = {
  reference: "LTA-20261019-AAAAAAAAAAAAAAAA", created_at: "2026-10-18T12:00:00.000Z",
  origin: "LUN", destination: "JNB", departure_date: "2026-12-15", return_date: null,
  trip_type: "oneway", adults: 1, children: 0, infants: 0, cabin_class: "economy", status: "reviewing",
};
const kakandeRequest = {
  reference: "KMR-20261019-BBBBBBBBBBBBBBBB", created_at: "2026-10-18T13:00:00.000Z",
  trip_month: "December 2026", travel_mode: "road", travel_date: "2026-12-20",
  price_per_traveller_zmw: 4000, traveller_count: 2, total_quoted_amount_zmw: 8000,
  currency_code: "ZMW", status: "approved",
};

function resolveRpc(flight: unknown = [flightRequest], kakande: unknown = [kakandeRequest]) {
  rpcMock.mockImplementation((name: string) => Promise.resolve({
    data: name === "my_flight_quote_requests" ? flight : kakande,
    error: null,
  }));
}

describe("customer My Requests panel", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    resolveRpc();
  });

  it("renders safe flight and Kakande details and status labels", async () => {
    render(<MyRequests userId="customer-a" />);
    expect(await screen.findByText(flightRequest.reference)).toBeInTheDocument();
    expect(screen.getByText("LUN → JNB")).toBeInTheDocument();
    expect(screen.getByText("Under review")).toBeInTheDocument();
    expect(screen.getByText(kakandeRequest.reference)).toBeInTheDocument();
    expect(screen.getByText("December 2026 · 20 Dec 2026")).toBeInTheDocument();
    expect(screen.getByText("Approved by Luskam")).toBeInTheDocument();
    expect(screen.getByText(/approval by Kakande Ministries/i)).toBeInTheDocument();
    expect(screen.queryByText(/internal note|audit event|customer email/i)).not.toBeInTheDocument();
    expect(rpcMock).toHaveBeenCalledWith("my_flight_quote_requests");
    expect(rpcMock).toHaveBeenCalledWith("my_kakande_ministry_requests");
    expect(rpcMock).not.toHaveBeenCalledWith("flight_quote_requests");
    expect(rpcMock).not.toHaveBeenCalledWith("kakande_ministry_requests");
  });

  it("renders loading and empty states", async () => {
    const finishes: Array<(value: { data: unknown; error: null }) => void> = [];
    rpcMock.mockImplementation(() => new Promise((resolve) => { finishes.push(resolve); }));
    render(<MyRequests userId="customer-a" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading your requests");
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    finishes.forEach((finish) => finish({ data: [], error: null }));
    expect(await screen.findByText("No requests linked to this account")).toBeInTheDocument();
    expect(screen.getByText(/not linked automatically/i)).toBeInTheDocument();
  });

  it("shows a generic error and retries both customer RPCs", async () => {
    rpcMock.mockImplementationOnce(async () => ({ data: null, error: { message: "private backend detail" } }))
      .mockImplementationOnce(async () => ({ data: null, error: { message: "private backend detail" } }))
      .mockImplementation((name: string) => Promise.resolve({ data: name === "my_flight_quote_requests" ? [] : [], error: null }));
    render(<MyRequests userId="customer-a" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t load your requests");
    expect(screen.queryByText("private backend detail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No requests linked to this account")).toBeInTheDocument();
    expect(rpcMock).toHaveBeenCalledTimes(4);
  });

  it("refreshes statuses from the server after staff changes", async () => {
    resolveRpc([flightRequest], [kakandeRequest]);
    render(<MyRequests userId="customer-a" />);
    expect(await screen.findByText("Under review")).toBeInTheDocument();
    rpcMock.mockImplementation((name: string) => Promise.resolve({
      data: name === "my_flight_quote_requests" ? [{ ...flightRequest, status: "quoted" }] : [{ ...kakandeRequest, status: "rejected" }],
      error: null,
    }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("Quotation prepared")).toBeInTheDocument();
    expect(await screen.findByText("Not approved by Luskam")).toBeInTheDocument();
    expect(rpcMock).toHaveBeenCalledTimes(4);
  });
});

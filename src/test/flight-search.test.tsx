import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchModule } from "@/components/SearchModule";
import FlightsPage from "@/pages/Flights";
import { readOffer } from "@/lib/flightOffer";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));
vi.mock("@/components/Header", () => ({ Header: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));

const flightResults = [
  { id: "fare-low", airline: "Budget Air", code: "BA 101", from: "LUN", to: "JNB", depart: "12:00", arrive: "20:00", duration: "8h 0m", stops: "1 stop · ADD", cabin: "Economy", price: 100, currency: "USD", fareType: "Live fare", priced: true, live: true },
  { id: "fare-direct", airline: "Direct Air", code: "DA 202", from: "LUN", to: "JNB", depart: "09:00", arrive: "14:30", duration: "5h 30m", stops: "Direct", cabin: "Economy", price: 220, currency: "USD", fareType: "Live fare", priced: true, live: true },
  { id: "fare-fast", airline: "Fast Air", code: "FA 303", from: "LUN", to: "JNB", depart: "14:00", arrive: "16:50", duration: "2h 50m", stops: "2 stops", cabin: "Economy", price: 160, currency: "USD", fareType: "Live fare", priced: true, live: true },
  { id: "fare-early", airline: "Early Air", code: "EA 404", from: "LUN", to: "JNB", depart: "05:00", arrive: "11:00", duration: "6h 0m", stops: "1 stop", cabin: "Economy", price: 190, currency: "USD", fareType: "Live fare", priced: true, live: true },
];

const initialFlightUrl = "/flights?from=LUN&to=JNB&depart=2026-11-10&ret=&adults=2&children=0&infants=0&cabin=Economy&trip=oneway";

const SearchState = () => {
  const [params] = useSearchParams();
  return <pre data-testid="search-state">{JSON.stringify(Object.fromEntries(params.entries()))}</pre>;
};

const CheckoutProbe = () => {
  const [params] = useSearchParams();
  const offer = readOffer(params.get("offer") ?? "");
  return <pre data-testid="checkout-state">{JSON.stringify({ params: Object.fromEntries(params.entries()), offer })}</pre>;
};

const renderFlights = (initialEntry = initialFlightUrl) => render(
  <MemoryRouter initialEntries={[initialEntry]}>
    <Routes>
      <Route path="/flights" element={<FlightsPage />} />
      <Route path="/checkout" element={<CheckoutProbe />} />
    </Routes>
  </MemoryRouter>,
);

describe("flight search and results", () => {
  beforeEach(() => {
    sessionStorage.clear();
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ data: { flights: flightResults, source: "live_fares" }, error: null });
  });

  it("keeps existing one-way search parameters when the search form navigates", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<SearchModule />} />
          <Route path="/flights" element={<SearchState />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "One way" }));
    fireEvent.click(screen.getByRole("button", { name: "Search Flights" }));

    const state = JSON.parse((await screen.findByTestId("search-state")).textContent ?? "{}");
    expect(state).toMatchObject({ from: "LUN", to: "JNB", ret: "", adults: "1", children: "0", infants: "0", cabin: "Economy", trip: "oneway" });
    expect(state.depart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("carries selected airports, return dates, passenger counts, and cabin into flight search", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<SearchModule />} />
          <Route path="/flights" element={<FlightsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /From airport:/ }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Search from airports" }), { target: { value: "Nairobi" } });
    fireEvent.click(await screen.findByRole("button", { name: /Nairobi.*NBO/ }));

    fireEvent.click(screen.getByRole("button", { name: /1 Traveler/ }));
    fireEvent.click(screen.getByRole("button", { name: "Increase Adults" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Business" } });
    fireEvent.click(screen.getByRole("button", { name: "Search Flights" }));

    await screen.findAllByRole("article");
    expect(invokeMock).toHaveBeenCalledWith("flight-search", {
      body: expect.objectContaining({ from: "NBO", to: "JNB", cabin: "Business", adults: 2, children: 0, infants: 0 }),
    });
    const request = invokeMock.mock.calls[0][1].body;
    expect(request.depart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(request.ret).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(request.ret >= request.depart).toBe(true);
  });

  it("sorts returned fares by lowest price, shortest duration, and earliest departure", async () => {
    renderFlights();
    let cards = await screen.findAllByRole("article");
    expect(cards[0]).toHaveTextContent("Budget Air");
    expect(invokeMock).toHaveBeenCalledWith("flight-search", {
      body: { from: "LUN", to: "JNB", depart: "2026-11-10", ret: null, cabin: "Economy", adults: 2, children: 0, infants: 0 },
    });

    fireEvent.change(screen.getByLabelText("Sort flights"), { target: { value: "duration" } });
    cards = screen.getAllByRole("article");
    expect(cards[0]).toHaveTextContent("Fast Air");

    fireEvent.change(screen.getByLabelText("Sort flights"), { target: { value: "depart" } });
    cards = screen.getAllByRole("article");
    expect(cards[0]).toHaveTextContent("Early Air");
  });

  it("filters using the stop count from each returned result", async () => {
    renderFlights();
    await screen.findAllByRole("article");

    fireEvent.click(screen.getByRole("radio", { name: "Nonstop" }));
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent("Direct Air");
  });

  it("shows schedule-only results as fares on request without inventing a price", async () => {
    invokeMock.mockResolvedValue({
      data: {
        source: "flight_information",
        flights: [{ ...flightResults[0], id: "schedule-only", airline: "Scheduled carrier", price: null, currency: null, priced: false, fareType: "Flight information", live: true }],
      },
      error: null,
    });
    renderFlights();

    expect(await screen.findByText("Airline information unavailable")).toBeInTheDocument();
    expect(screen.getByText("Price on request")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request this flight" })).toBeInTheDocument();
  });

  it("shows a network error and retries the same flight search", async () => {
    invokeMock.mockRejectedValueOnce(new Error("network unavailable"));
    invokeMock.mockResolvedValueOnce({ data: { flights: flightResults, source: "live_fares" }, error: null });
    renderFlights();

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findAllByRole("article")).toHaveLength(4);
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("stores the selected real offer and preserves search parameters through checkout navigation", async () => {
    renderFlights();
    await screen.findAllByRole("article");

    fireEvent.click(screen.getAllByRole("button", { name: "Select flight" })[0]);
    expect(await screen.findByText("Your selection")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    const state = JSON.parse((await screen.findByTestId("checkout-state")).textContent ?? "{}");
    expect(state.params).toMatchObject({ from: "LUN", to: "JNB", depart: "2026-11-10", ret: "", adults: "2", trip: "oneway", offer: "fare-low" });
    expect(state.offer).toMatchObject({ id: "fare-low", airline: "Budget Air", currency: "USD" });
  });
});

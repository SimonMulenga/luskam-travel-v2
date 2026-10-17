import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchModule } from "@/components/SearchModule";
import FlightsPage from "@/pages/Flights";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: invokeMock } } }));
vi.mock("@/components/Header", () => ({ Header: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));

const searchUrl = "/flights?from=LUN&to=JNB&depart=2026-11-10&ret=&adults=2&children=0&infants=0&cabin=Economy&trip=oneway";
const SearchState = () => {
  const [params] = useSearchParams();
  return <pre data-testid="search-state">{JSON.stringify(Object.fromEntries(params.entries()))}</pre>;
};
const renderFlights = (initialEntry = searchUrl) => render(
  <MemoryRouter initialEntries={[initialEntry]}><Routes><Route path="/flights" element={<FlightsPage />} /></Routes></MemoryRouter>,
);

describe("manual flight quotation workflow", () => {
  beforeEach(() => invokeMock.mockReset());

  it("preserves flight search selections without invoking a flight provider", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes><Route path="/" element={<SearchModule />} /><Route path="/flights" element={<SearchState />} /></Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "One way" }));
    fireEvent.click(screen.getByRole("button", { name: "Search Flights" }));
    const state = JSON.parse((await screen.findByTestId("search-state")).textContent ?? "{}");
    expect(state).toMatchObject({ from: "LUN", to: "JNB", ret: "", adults: "1", children: "0", infants: "0", cabin: "Economy", trip: "oneway" });
    expect(state.depart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("shows the itinerary and submits only an anonymous quote request", async () => {
    invokeMock.mockResolvedValue({ data: { reference: "LTA-20261110-AB12CD34" }, error: null });
    renderFlights();
    expect(await screen.findByRole("heading", { level: 1, name: /Lusaka.*LUN.*Johannesburg.*JNB/ })).toBeInTheDocument();
    expect(screen.getByText(/2 adults · 0 children · 0 infants/)).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Synthetic Customer" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "synthetic@example.test" } });
    fireEvent.change(screen.getByLabelText("Telephone or WhatsApp number"), { target: { value: "+260 977 000 000" } });
    fireEvent.change(screen.getByLabelText(/Special requests/), { target: { value: "Window seat preference" } });
    fireEvent.click(screen.getByRole("button", { name: "Request flight quote" }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    const [functionName, { body }] = invokeMock.mock.calls[0];
    expect(functionName).toBe("request-flight-quote");
    expect(body).toMatchObject({
      search: { origin: "LUN", destination: "JNB", departureDate: "2026-11-10", returnDate: null, tripType: "oneway", passengers: { adults: 2, children: 0, infants: 0 }, cabinClass: "economy" },
      contact: { fullName: "Synthetic Customer", email: "synthetic@example.test", phone: "+260 977 000 000" },
      specialRequests: "Window seat preference",
    });
    expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body).not.toHaveProperty("user_id");
    expect(body).not.toHaveProperty("price");
    expect(await screen.findByTestId("quote-reference")).toHaveTextContent("LTA-20261110-AB12CD34");
    expect(screen.getByText(/does not reserve a seat or confirm an airline booking/)).toBeInTheDocument();
    expect(invokeMock.mock.calls.map(([name]) => name)).not.toContain("flight-search");
  });

  it("shows a safe error and keeps the customer request details for retry", async () => {
    invokeMock.mockRejectedValueOnce(new Error("sensitive database detail"));
    renderFlights();
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Synthetic Customer" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "synthetic@example.test" } });
    fireEvent.change(screen.getByLabelText("Telephone or WhatsApp number"), { target: { value: "+260 977 000 000" } });
    fireEvent.click(screen.getByRole("button", { name: "Request flight quote" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't submit your request just now");
    expect(screen.queryByText("sensitive database detail")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("Synthetic Customer");
  });

  it("keeps the contact form and trip summary usable in narrow viewport layouts", () => {
    window.innerWidth = 375;
    renderFlights();
    expect(screen.getByLabelText("Full name")).toBeVisible();
    expect(screen.getByLabelText("Email")).toBeVisible();
    expect(screen.getByLabelText("Telephone or WhatsApp number")).toBeVisible();
    expect(screen.getByRole("button", { name: "Request flight quote" })).toBeVisible();
    expect(screen.getByLabelText("Full name").closest("section")).toHaveClass("min-w-0");
  });
});

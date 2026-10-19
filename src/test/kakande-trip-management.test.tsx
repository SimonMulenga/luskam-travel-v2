import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { format, parseISO } from "date-fns";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KakandeTripManagement } from "@/components/admin/KakandeTripManagement";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock } }));

const futureDate = (days: number) => {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
};
const tripMonth = () => futureDate(60).slice(0, 7);
const fillValidTrip = () => {
  fireEvent.click(screen.getByRole("button", { name: "New trip" }));
  fireEvent.change(screen.getByLabelText("Trip month and year"), { target: { value: tripMonth() } });
  fireEvent.change(screen.getByLabelText("flight departure date"), { target: { value: futureDate(65) } });
  fireEvent.change(screen.getByLabelText("flight price"), { target: { value: "11200.50" } });
  fireEvent.change(screen.getByLabelText("flight availability"), { target: { value: "open" } });
  fireEvent.change(screen.getByLabelText("road departure date"), { target: { value: futureDate(66) } });
  fireEvent.change(screen.getByLabelText("road price"), { target: { value: "4700" } });
  fireEvent.change(screen.getByLabelText("road availability"), { target: { value: "filling_fast" } });
};

describe("Kakande admin trip management", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    rpcMock.mockImplementation(async (name: string) => {
      if (name === "list_kakande_monthly_trips") return { data: [], error: null };
      return { data: { outcome: "created" }, error: null };
    });
  });

  it("starts with no invented date, price, availability, or publication state and saves an unpublished draft", async () => {
    render(<KakandeTripManagement />);
    await screen.findByText(/No trips are configured/);
    fillValidTrip();
    expect(screen.getByLabelText("Publish trip")).not.toBeChecked();
    expect(screen.getByLabelText("Publish flight option")).not.toBeChecked();
    expect(screen.getByLabelText("Publish road option")).not.toBeChecked();
    expect(screen.getByLabelText("Trip month and year")).toHaveValue(tripMonth());
    const expectedMonthLabel = format(parseISO(`${tripMonth()}-01`), "MMMM yyyy");
    expect(screen.getByRole("heading", { name: new RegExp(`${expectedMonthLabel}$`) })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Publish trip"));
    fireEvent.click(screen.getByLabelText("Publish flight option"));
    fireEvent.click(screen.getByLabelText("Publish road option"));
    fireEvent.click(screen.getByRole("button", { name: "Save as unpublished draft" }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith("save_kakande_monthly_trip", expect.objectContaining({
      p_trip_published: false,
      p_flight_published: false,
      p_road_published: false,
      p_trip_id: tripMonth(),
      p_month_label: expectedMonthLabel,
      p_flight_availability: "open",
      p_road_availability: "filling_fast",
      p_flight_price_zmw: 11200.5,
      p_road_price_zmw: 4700,
    })));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent("Trip saved as an unpublished draft");
  });

  it("requires explicit confirmation before sending any published configuration", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<KakandeTripManagement />);
    await screen.findByText(/No trips are configured/);
    fillValidTrip();
    fireEvent.click(screen.getByLabelText("Publish trip"));
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(rpcMock).not.toHaveBeenCalledWith("save_kakande_monthly_trip", expect.anything());

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith("save_kakande_monthly_trip", expect.objectContaining({ p_trip_published: true })));
  });

  it("loads an existing trip for editing and unpublishes it through the draft action", async () => {
    const month = tripMonth();
    const monthLabel = format(parseISO(`${month}-01`), "MMMM yyyy");
    rpcMock.mockImplementation(async (name: string) => {
      if (name === "list_kakande_monthly_trips") return { data: [{
        trip_id: "synthetic-existing-trip",
        month_label: monthLabel,
        is_published: true,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
        flight_option: { option_id: "flight-option", transport_mode: "flight", departure_date: futureDate(65), price_per_traveller_zmw: 11200, is_published: true, availability: "open" },
        road_option: { option_id: "road-option", transport_mode: "road", departure_date: futureDate(66), price_per_traveller_zmw: 4700, is_published: true, availability: "filling_fast" },
      }], error: null };
      return { data: { outcome: "updated" }, error: null };
    });
    render(<KakandeTripManagement />);
    expect(await screen.findByRole("heading", { name: new RegExp(`${monthLabel}$`) })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Trip month and year")).toHaveValue(month);
    fireEvent.click(screen.getByRole("button", { name: "Save as unpublished draft" }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith("save_kakande_monthly_trip", expect.objectContaining({
      p_trip_id: "synthetic-existing-trip",
      p_trip_published: false,
      p_flight_published: false,
      p_road_published: false,
    })));
  });

  it("keeps historical trip configurations locked from editing", async () => {
    rpcMock.mockResolvedValue({ data: [{
      trip_id: "jun-2026",
      month_label: "June 2026",
      is_published: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      flight_option: { option_id: "historical-flight", transport_mode: "flight", departure_date: "2026-06-20", price_per_traveller_zmw: 10950, is_published: false, availability: "closed" },
      road_option: { option_id: "historical-road", transport_mode: "road", departure_date: "2026-06-20", price_per_traveller_zmw: 4500, is_published: false, availability: "closed" },
    }], error: null });
    render(<KakandeTripManagement />);
    expect(await screen.findByRole("heading", { name: /June 2026$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Historical" })).toBeDisabled();
    expect(screen.queryByRole("heading", { name: "Edit trip configuration" })).not.toBeInTheDocument();
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("filters trips by the normalized stored month/year label", async () => {
    const tripFor = (days: number, id: string) => {
      const month = futureDate(days).slice(0, 7);
      const monthLabel = format(parseISO(`${month}-01`), "MMMM yyyy");
      const date = futureDate(days + 4);
      return {
        trip_id: id,
        month_label: monthLabel,
        is_published: false,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
        flight_option: { option_id: `${id}-flight`, transport_mode: "flight", departure_date: date, price_per_traveller_zmw: 1000, is_published: false, availability: "closed" },
        road_option: { option_id: `${id}-road`, transport_mode: "road", departure_date: date, price_per_traveller_zmw: 500, is_published: false, availability: "closed" },
      };
    };
    const first = tripFor(60, "synthetic-december");
    const second = tripFor(150, "synthetic-march");
    rpcMock.mockResolvedValue({ data: [first, second], error: null });
    render(<KakandeTripManagement />);
    const firstHeading = await screen.findByRole("heading", { name: new RegExp(`${first.month_label}$`) });
    const secondHeading = screen.getByRole("heading", { name: new RegExp(`${second.month_label}$`) });
    expect(firstHeading).toHaveTextContent("Kakande Ministries");
    expect(secondHeading).toHaveTextContent("Kakande Ministries");

    fireEvent.change(screen.getByLabelText("Filter trips by month"), { target: { value: futureDate(60).slice(0, 7) } });
    expect(screen.getByRole("heading", { name: new RegExp(`${first.month_label}$`) })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: new RegExp(`${second.month_label}$`) })).not.toBeInTheDocument();
  });

  it("rejects missing fields, past dates, and invalid prices before calling the save RPC", async () => {
    render(<KakandeTripManagement />);
    await screen.findByText(/No trips are configured/);
    fireEvent.click(screen.getByRole("button", { name: "New trip" }));
    fireEvent.submit(screen.getByLabelText("Trip month and year").closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a trip month and year");
    expect(rpcMock).not.toHaveBeenCalledWith("save_kakande_monthly_trip", expect.anything());

    fillValidTrip();
    fireEvent.change(screen.getByLabelText("flight departure date"), { target: { value: "2020-01-01" } });
    fireEvent.submit(screen.getByLabelText("Trip month and year").closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Both departure dates must be in the future");
    expect(rpcMock).not.toHaveBeenCalledWith("save_kakande_monthly_trip", expect.anything());

    fireEvent.change(screen.getByLabelText("flight departure date"), { target: { value: futureDate(65) } });
    fireEvent.change(screen.getByLabelText("flight price"), { target: { value: "0" } });
    fireEvent.submit(screen.getByLabelText("Trip month and year").closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Flight price must be greater than zero");
    expect(rpcMock).not.toHaveBeenCalledWith("save_kakande_monthly_trip", expect.anything());

    fireEvent.change(screen.getByLabelText("flight price"), { target: { value: "11200.50" } });
    fireEvent.change(screen.getByLabelText("road price"), { target: { value: "4700.123" } });
    fireEvent.submit(screen.getByLabelText("Trip month and year").closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Road price must be greater than zero");

    fireEvent.change(screen.getByLabelText("road price"), { target: { value: "4700" } });
    fireEvent.change(screen.getByLabelText("Trip month and year"), { target: { value: "2020-01" } });
    fireEvent.submit(screen.getByLabelText("Trip month and year").closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose the current or a future trip month");
    expect(rpcMock).not.toHaveBeenCalledWith("save_kakande_monthly_trip", expect.anything());
  });

  it("shows a safe error when the database rejects a save and does not claim success", async () => {
    rpcMock.mockImplementation(async (name: string) => name === "list_kakande_monthly_trips"
      ? { data: [], error: null }
      : { data: null, error: new Error("private database failure detail") });
    render(<KakandeTripManagement />);
    await screen.findByText(/No trips are configured/);
    fillValidTrip();
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The trip could not be saved");
    expect(screen.queryByText("private database failure detail")).not.toBeInTheDocument();
    expect(screen.queryByText("Trip configuration saved.")).not.toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FlightQuoteRequests } from "@/components/admin/FlightQuoteRequests";

const { fromMock, updateMock, updateSelectMock, updateEqMock, updateSingleMock } = vi.hoisted(() => ({
  fromMock: vi.fn(), updateMock: vi.fn(), updateSelectMock: vi.fn(), updateEqMock: vi.fn(), updateSingleMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: fromMock } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const syntheticRequest = {
  id: "e5311de9-f1ae-4edb-bcc6-e3b4d3607c12", reference: "LTA-20261016-AB12CD34",
  origin: "LUN", destination: "JNB", departure_date: "2026-11-10", return_date: null,
  trip_type: "oneway", adults: 1, children: 1, infants: 0, cabin_class: "economy",
  customer_name: "Synthetic Customer", customer_email: "synthetic@example.test", customer_phone: "+260 977 000 000",
  special_requests: "Synthetic note", status: "pending", internal_notes: "", created_at: "2026-10-16T09:00:00.000Z",
};

describe("admin flight quotation request queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateSingleMock.mockResolvedValue({ data: { id: syntheticRequest.id }, error: null });
    updateEqMock.mockReturnValue({ select: updateSelectMock });
    updateSelectMock.mockReturnValue({ maybeSingle: updateSingleMock });
    updateMock.mockReturnValue({ eq: updateEqMock });
    fromMock.mockReturnValue({
      select: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [syntheticRequest], error: null }) })) })),
      update: updateMock,
    });
  });

  it("shows itinerary, dates, passenger counts, contact links and status workflow", async () => {
    render(<FlightQuoteRequests />);
    expect(await screen.findByText("LTA-20261016-AB12CD34")).toBeInTheDocument();
    expect(screen.getByText("Synthetic Customer")).toBeInTheDocument();
    expect(screen.getByText("LUN")).toBeInTheDocument();
    expect(screen.getByText("JNB")).toBeInTheDocument();
    expect(screen.getByText("1 adults · 1 children · 0 infants")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Email customer/ })).toHaveAttribute("href", expect.stringContaining("mailto:"));
    expect(screen.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", "https://wa.me/260977000000");
    expect(screen.getByLabelText("Request status")).toHaveValue("pending");
    expect(screen.getByText(/does not mean an airline reservation or ticket exists/)).toBeInTheDocument();
  });

  it("saves only permitted status and internal notes fields", async () => {
    render(<FlightQuoteRequests />);
    await screen.findByText("LTA-20261016-AB12CD34");
    fireEvent.change(screen.getByLabelText("Request status"), { target: { value: "quoted" } });
    fireEvent.change(screen.getByLabelText(/Internal notes/), { target: { value: "Synthetic staff note" } });
    fireEvent.click(screen.getByRole("button", { name: /Save updates/ }));
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith({ status: "quoted", internal_notes: "Synthetic staff note" }));
    expect(updateEqMock).toHaveBeenCalledWith("id", syntheticRequest.id);
  });
});

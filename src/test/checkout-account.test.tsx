import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Checkout from "@/pages/Checkout";
import AccountPage from "@/pages/Account";
import { bookingStatus, paymentStatus } from "@/lib/bookingStatus";

const { quoteFlightRequestMock, submitFlightRequestMock, getSessionMock, fromMock, rpcMock, signOutMock } = vi.hoisted(() => ({
  quoteFlightRequestMock: vi.fn(),
  submitFlightRequestMock: vi.fn(),
  getSessionMock: vi.fn(),
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("@/lib/bookings", () => ({ quoteFlightRequest: quoteFlightRequestMock, submitFlightRequest: submitFlightRequestMock, generateReference: () => "LKTEST1" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: getSessionMock }, from: fromMock, rpc: rpcMock } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "customer-1", email: "traveler@example.com" }, loading: false, signOut: signOutMock }) }));
vi.mock("@/components/Header", () => ({ Header: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));

const selectedOffer = {
  id: "offer-123", airline: "Air Example", code: "AE 123", from: "LUN", to: "JNB",
  depart: "08:30", arrive: "10:15", duration: "1h 45m", stops: "Direct", cabin: "Economy",
  price: 320, currency: "USD", fareType: "Standard", priced: true, providerReference: "provider-offer-123",
};

const accountBookings = [
  { id: "b-pending", reference: "LKPND1", type: "flight", status: "pending", payment_status: "pending", total_amount: 640, currency: "USD", travel_date: "2026-12-10", details: { airline: "Air Example", code: "AE 123", from: "LUN", to: "JNB", pax: [{ firstName: "Secret", passport: "PRIVATE" }] }, created_at: "2026-10-01T10:00:00Z" },
  { id: "b-confirmed", reference: "LKCNF1", type: "flight", status: "confirmed", payment_status: "paid", total_amount: 300, currency: "USD", travel_date: null, details: { airline: "Other Air", from: "LUN", to: "NBO" }, created_at: "2026-09-01T10:00:00Z" },
  { id: "b-complete", reference: "LKDON1", type: "hotel", status: "completed", payment_status: "refunded", total_amount: 80, currency: "USD", travel_date: null, details: { name: "City Hotel", city: "Lusaka" }, created_at: "2026-08-01T10:00:00Z" },
  { id: "b-cancel", reference: "LKCAN1", type: "car", status: "cancelled", payment_status: "pending", total_amount: 40, currency: "USD", travel_date: null, details: {}, created_at: "2026-07-01T10:00:00Z" },
  { id: "b-failed", reference: "LKFLD1", type: "package", status: "failed", payment_status: "pending", total_amount: 10, currency: "USD", travel_date: null, details: {}, created_at: "2026-06-01T10:00:00Z" },
];

function renderCheckout() {
  return render(<MemoryRouter initialEntries={["/checkout?from=LUN&to=JNB&depart=2026-12-10&cabin=Economy&adults=2&children=0&infants=0&offer=offer-123&trip=oneway"]}><Routes><Route path="/checkout" element={<Checkout />} /></Routes></MemoryRouter>);
}

describe("premium checkout and account", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollTo", { configurable: true, value: vi.fn() });
    sessionStorage.clear();
    sessionStorage.setItem("luskam.selectedOffer", JSON.stringify(selectedOffer));
    quoteFlightRequestMock.mockReset().mockResolvedValue({ quoteToken: "signed-server-quote", amount: 640, currency: "USD" });
    submitFlightRequestMock.mockReset().mockResolvedValue({ id: "booking-id", reference: "LKSERVER1" });
    getSessionMock.mockReset().mockResolvedValue({ data: { session: { user: { id: "customer-1" } } } });
    fromMock.mockReset();
    rpcMock.mockReset().mockResolvedValue({ error: null });
    signOutMock.mockReset();
  });

  it("validates each checkout step and preserves the request payload and offer identifiers", async () => {
    renderCheckout();
    expect(await screen.findByRole("heading", { name: "Review your flight and fare" })).toBeInTheDocument();
    expect(screen.getAllByText(/640\.00/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(await screen.findByRole("heading", { name: "Traveler information" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(await screen.findAllByRole("alert")).toHaveLength(4);
    expect(screen.getByRole("heading", { name: "Traveler information" })).toBeInTheDocument();

    fireEvent.change(screen.getAllByLabelText(/First name/, { selector: "input" })[0], { target: { value: "Ada" } });
    fireEvent.change(screen.getAllByLabelText(/Last name/, { selector: "input" })[0], { target: { value: "Lovelace" } });
    fireEvent.change(screen.getAllByLabelText(/First name/, { selector: "input" })[1], { target: { value: "Byron" } });
    fireEvent.change(screen.getAllByLabelText(/Last name/, { selector: "input" })[1], { target: { value: "Lovelace" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(await screen.findByRole("heading", { name: "How can we reach you?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter a phone number we can reach you on.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText(/Phone number/), { target: { value: "+260 977 000 111" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(await screen.findByRole("heading", { name: "Review and send your request" })).toBeInTheDocument();
    expect(screen.getByText("Estimated fare")).toBeInTheDocument();
    expect(screen.getByText(/not an invoice, reservation, or payment request/i)).toBeInTheDocument();
    expect(screen.getByText(/Do not pay until Luskam verifies the quotation and sends you payment instructions/i)).toBeInTheDocument();
    expect(screen.queryByText(/Manual payment options|Mobile Money|MTN \/ Airtel|Bank transfer|Lusaka office/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Passport number")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nationality")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Submit booking request" }));
    expect(await screen.findByRole("heading", { name: "Our travel desk will follow up" })).toBeInTheDocument();
    expect(screen.getByText(/not a final invoice or payment request/i)).toBeInTheDocument();
    expect(screen.getByText(/Payment alone does not confirm ticket issuance/i)).toBeInTheDocument();
    expect(screen.queryByText(/Mobile Money|MTN \/ Airtel|Bank transfer|Lusaka office/i)).not.toBeInTheDocument();
    expect(screen.getByText("Request received · Awaiting review")).toBeInTheDocument();
    expect(screen.queryByText("Ticket confirmed")).not.toBeInTheDocument();
    expect(quoteFlightRequestMock).toHaveBeenCalledWith({
      providerReference: "provider-offer-123",
      search: { origin: "LUN", destination: "JNB", departureDate: "2026-12-10", returnDate: null, cabin: "Economy", passengers: { adults: 2, children: 0, infants: 0 } },
    });
    expect(submitFlightRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      search: { origin: "LUN", destination: "JNB", departureDate: "2026-12-10", returnDate: null, cabin: "Economy", passengers: { adults: 2, children: 0, infants: 0 } },
      providerReference: "provider-offer-123", quoteToken: "signed-server-quote", scheduleOnly: false,
      contact: { email: "ada@example.com", phone: "+260 977 000 111" },
      passengers: [expect.objectContaining({ firstName: "Ada", lastName: "Lovelace", type: "adult" }), expect.objectContaining({ firstName: "Byron", lastName: "Lovelace", type: "adult" })],
    }));
    const submittedPayload = submitFlightRequestMock.mock.calls[0][0];
    expect(submittedPayload).not.toHaveProperty("total_amount");
    expect(submittedPayload).not.toHaveProperty("status");
  });

  it("routes customer cancellation through the owner-authorized RPC", async () => {
    const bookingQuery = { select: vi.fn(), order: vi.fn() };
    bookingQuery.select.mockReturnValue(bookingQuery);
    bookingQuery.order.mockResolvedValue({ data: accountBookings, error: null });
    const profileQuery = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    profileQuery.select.mockReturnValue(profileQuery);
    profileQuery.eq.mockReturnValue(profileQuery);
    profileQuery.maybeSingle.mockResolvedValue({ data: { full_name: "Ada Lovelace", phone: null }, error: null });
    fromMock.mockImplementation((table: string) => table === "bookings" ? bookingQuery : profileQuery);
    Object.defineProperty(window, "confirm", { configurable: true, value: vi.fn(() => true) });

    render(<MemoryRouter><AccountPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel request" }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith("request_booking_cancellation", { p_booking_id: "b-pending" }));
  });
  it("maps existing statuses to manual request language without implying airline or ticket confirmation", () => {
    expect(bookingStatus("pending").label).toBe("Request received");
    expect(bookingStatus("confirmed").label).toBe("Request approved");
    expect(bookingStatus("confirmed").description).toContain("does not confirm an airline reservation or ticket issuance");
    expect(bookingStatus("completed").label).toBe("Request completed");
    expect(bookingStatus("cancelled").label).toBe("Cancelled");
    expect(bookingStatus("failed").label).toBe("Failed");
    expect(paymentStatus("pending").label).toBe("Payment not requested");
    expect(paymentStatus("pending").description).toContain("verified payment instructions");
    expect(paymentStatus("pending", 0).label).toBe("Price pending");
    expect(paymentStatus("paid").label).toBe("Payment recorded");
    expect(paymentStatus("paid").description).toContain("does not confirm an airline reservation or ticket issuance");
    expect(paymentStatus("refunded").label).toBe("Refunded");
    expect(bookingStatus("payment_verification_pending").label).toBe("Payment Verification Pending");
  });

  it("renders only returned account records with Option A booking and payment labels", async () => {
    const bookingQuery = { select: vi.fn(), order: vi.fn() };
    bookingQuery.select.mockReturnValue(bookingQuery);
    bookingQuery.order.mockResolvedValue({ data: accountBookings, error: null });
    const profileQuery = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    profileQuery.select.mockReturnValue(profileQuery);
    profileQuery.eq.mockReturnValue(profileQuery);
    profileQuery.maybeSingle.mockResolvedValue({ data: { full_name: "Ada Lovelace", phone: "+260 977 000 111" }, error: null });
    fromMock.mockImplementation((table: string) => table === "bookings" ? bookingQuery : profileQuery);

    render(<MemoryRouter><AccountPage /></MemoryRouter>);
    expect((await screen.findAllByText("LKPND1")).length).toBeGreaterThan(0);
    expect(screen.getByText("Request received")).toBeInTheDocument();
    expect(screen.getByText("Request approved")).toBeInTheDocument();
    expect(screen.getByText("Request completed")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getAllByText("Payment not requested").length).toBeGreaterThan(0);
    expect(screen.getByText("Payment recorded")).toBeInTheDocument();
    expect(screen.getByText("Refunded")).toBeInTheDocument();
    expect(screen.queryByText("PRIVATE")).not.toBeInTheDocument();
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
    expect(screen.queryByText(/Mobile Money|MTN \/ Airtel|Bank transfer|Lusaka office/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Payment alone does not mean a ticket has been issued/i).length).toBeGreaterThan(0);
    expect(fromMock).toHaveBeenCalledWith("bookings");
    expect(profileQuery.eq).toHaveBeenCalledWith("id", "customer-1");
    expect(bookingQuery.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });
});

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { format, parseISO } from "date-fns";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KakandeRequests } from "@/components/admin/KakandeRequests";

const { fromMock, selectMock, orderMock, secondOrderMock, rangeMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  orderMock: vi.fn(),
  secondOrderMock: vi.fn(),
  rangeMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: fromMock, rpc: rpcMock } }));

const fixture = (overrides: Record<string, unknown> = {}) => ({
  id: "4c155ce5-1845-4b50-beb9-f314e35f236b",
  reference: "KMR-20261018-0123456789ABCDEF",
  customer_name: "Synthetic Kakande Applicant",
  customer_phone: "+260 977 000 111",
  trip_month: "October 2026",
  travel_mode: "road" as const,
  travel_date: "2026-10-28",
  total_quoted_amount_zmw: 4500,
  currency_code: "ZMW" as const,
  status: "pending" as const,
  internal_notes: "Synthetic internal note",
  created_at: "2026-10-18T10:30:00.000Z",
  ...overrides,
});

const rows = (count: number, start = 0) => Array.from({ length: count }, (_, index) => fixture({
  id: `synthetic-${start + index}`,
  reference: `KMR-20261018-${String(start + index).padStart(16, "0")}`,
}));

describe("admin Kakande request list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: [], error: null });
    fromMock.mockReturnValue({ select: selectMock });
    selectMock.mockReturnValue({ order: orderMock });
    orderMock.mockReturnValue({ order: secondOrderMock });
    secondOrderMock.mockReturnValue({ range: rangeMock });
  });

  it("renders request identity, route mode, dates, amount, status, and submission time using a minimal server query", async () => {
    rangeMock.mockResolvedValue({ data: [fixture()], error: null, count: 1 });
    render(<KakandeRequests />);

    expect(await screen.findByText("KMR-20261018-0123456789ABCDEF")).toBeInTheDocument();
    expect(screen.getByText("Synthetic Kakande Applicant")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+260 977 000 111" })).toHaveAttribute("href", "tel:+260 977 000 111");
    expect(screen.getByText("By road")).toBeInTheDocument();
    expect(screen.getByText("October 2026")).toBeInTheDocument();
    expect(screen.getByText("28 Oct 2026")).toBeInTheDocument();
    expect(screen.getByText("ZMW 4,500.00")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText(format(parseISO(fixture().created_at), "dd MMM yyyy, HH:mm"))).toBeInTheDocument();

    expect(fromMock).toHaveBeenCalledWith("kakande_ministry_requests");
    expect(selectMock).toHaveBeenCalledWith(
      "id, reference, customer_name, customer_phone, trip_month, travel_mode, travel_date, total_quoted_amount_zmw, currency_code, status, internal_notes, created_at",
      { count: "exact" },
    );
    const selectedColumns = selectMock.mock.calls[0][0] as string;
    expect(selectedColumns).toContain("internal_notes");
    expect(selectedColumns).not.toMatch(/customer_notes|customer_email|audit|event|details/i);
    expect(orderMock).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(secondOrderMock).toHaveBeenCalledWith("id", { ascending: true });
    expect(rangeMock).toHaveBeenCalledWith(0, 24);
  });

  it("shows loading then an empty state", async () => {
    let resolveQuery!: (value: { data: never[]; error: null; count: number }) => void;
    rangeMock.mockReturnValue(new Promise((resolve) => { resolveQuery = resolve; }));
    render(<KakandeRequests />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading Kakande requests");
    await act(async () => resolveQuery({ data: [], error: null, count: 0 }));
    expect(await screen.findByText("No Kakande requests yet")).toBeInTheDocument();
  });

  it("shows a safe error and retries on refresh", async () => {
    rangeMock
      .mockResolvedValueOnce({ data: null, error: new Error("private database detail"), count: null })
      .mockResolvedValueOnce({ data: [fixture({ travel_mode: "flight", status: "in_progress" })], error: null, count: 1 });
    render(<KakandeRequests />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Requests could not be loaded");
    expect(screen.queryByText("private database detail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("By flight")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(rangeMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes the current page", async () => {
    rangeMock.mockResolvedValue({ data: [fixture()], error: null, count: 1 });
    render(<KakandeRequests />);
    await screen.findByText("KMR-20261018-0123456789ABCDEF");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(rangeMock).toHaveBeenCalledTimes(2));
    expect(rangeMock).toHaveBeenLastCalledWith(0, 24);
  });

  it("uses exact-count server ranges and enforces pagination boundaries", async () => {
    rangeMock
      .mockResolvedValueOnce({ data: rows(25), error: null, count: 26 })
      .mockResolvedValueOnce({ data: [fixture({ id: "synthetic-25", reference: "KMR-20261018-0000000000000025" })], error: null, count: 26 })
      .mockResolvedValueOnce({ data: rows(25), error: null, count: 26 });
    render(<KakandeRequests />);

    expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();
    expect(rangeMock).toHaveBeenNthCalledWith(2, 25, 49);
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
    expect(rangeMock).toHaveBeenNthCalledWith(3, 0, 24);
  });

  it("does not mount or call the trip-management RPC for an agent request-list view", async () => {
    rangeMock.mockResolvedValue({ data: [], error: null, count: 0 });
    render(<KakandeRequests canManageTrips={false} />);
    await screen.findByText(/No Kakande requests yet/);
    expect(screen.queryByRole("heading", { name: "Manage trips" })).not.toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("loads trip configuration only when the parent grants the administrator capability", async () => {
    rangeMock.mockResolvedValue({ data: [], error: null, count: 0 });
    render(<KakandeRequests canManageTrips />);
    expect(await screen.findByRole("heading", { name: "Manage trips" })).toBeInTheDocument();
    expect(rpcMock).toHaveBeenCalledWith("list_kakande_monthly_trips");
  });

  it("lets an authorized admin update status and private notes through the RPC, then refreshes the saved status", async () => {
    rangeMock
      .mockResolvedValueOnce({ data: [fixture()], error: null, count: 1 })
      .mockResolvedValueOnce({ data: [fixture({ status: "approved", internal_notes: "Reviewed by staff" })], error: null, count: 1 });
    rpcMock.mockResolvedValueOnce({ data: { outcome: "updated", reference: fixture().reference, status: "approved" }, error: null });
    render(<KakandeRequests canUpdateRequests canApproveRequests />);

    await screen.findByText("KMR-20261018-0123456789ABCDEF");
    fireEvent.change(screen.getByRole("combobox", { name: "Request status for KMR-20261018-0123456789ABCDEF" }), { target: { value: "approved" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Internal staff notes for KMR-20261018-0123456789ABCDEF" }), { target: { value: "Reviewed by staff" } });
    fireEvent.click(screen.getByRole("button", { name: "Save update" }));

    expect(await screen.findByText("Request updated.")).toBeInTheDocument();
    expect(rpcMock).toHaveBeenCalledWith("update_kakande_ministry_request", {
      p_request_id: fixture().id,
      p_status: "approved",
      p_internal_notes: "Reviewed by staff",
    });
    await waitFor(() => expect(rangeMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("combobox", { name: "Request status for KMR-20261018-0123456789ABCDEF" })).toHaveValue("approved");
  });

  it("shows a safe error and keeps the previous status when the update RPC fails", async () => {
    rangeMock.mockResolvedValue({ data: [fixture()], error: null, count: 1 });
    rpcMock.mockResolvedValueOnce({ data: null, error: new Error("private database detail") });
    render(<KakandeRequests canUpdateRequests canApproveRequests />);
    await screen.findByText("KMR-20261018-0123456789ABCDEF");
    fireEvent.change(screen.getByRole("combobox", { name: "Request status for KMR-20261018-0123456789ABCDEF" }), { target: { value: "approved" } });
    fireEvent.click(screen.getByRole("button", { name: "Save update" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The request update could not be saved");
    expect(screen.queryByText("private database detail")).not.toBeInTheDocument();
    expect(screen.getAllByText("Pending")).toHaveLength(2);
    expect(rangeMock).toHaveBeenCalledTimes(1);
  });

  it("does not expose status controls unless the existing staff authorization guard grants them", async () => {
    rangeMock.mockResolvedValue({ data: [fixture()], error: null, count: 1 });
    render(<KakandeRequests />);
    await screen.findByText("KMR-20261018-0123456789ABCDEF");

    expect(screen.queryByRole("combobox", { name: /Request status/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Internal staff notes/ })).not.toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects invalid status values before calling the database RPC", async () => {
    rangeMock.mockResolvedValue({ data: [fixture()], error: null, count: 1 });
    render(<KakandeRequests canUpdateRequests canApproveRequests />);
    await screen.findByText("KMR-20261018-0123456789ABCDEF");
    fireEvent.change(screen.getByRole("combobox", { name: "Request status for KMR-20261018-0123456789ABCDEF" }), { target: { value: "forged_status" } });
    fireEvent.click(screen.getByRole("button", { name: "Save update" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This update is not permitted");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("prevents duplicate saves while an update is in progress", async () => {
    rangeMock.mockResolvedValue({ data: [fixture()], error: null, count: 1 });
    let resolveUpdate!: (value: { data: { outcome: string; reference: string; status: string }; error: null }) => void;
    rpcMock.mockReturnValueOnce(new Promise((resolve) => { resolveUpdate = resolve; }));
    render(<KakandeRequests canUpdateRequests canApproveRequests />);
    await screen.findByText("KMR-20261018-0123456789ABCDEF");
    fireEvent.change(screen.getByRole("combobox", { name: "Request status for KMR-20261018-0123456789ABCDEF" }), { target: { value: "approved" } });
    const saveButton = screen.getByRole("button", { name: "Save update" });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Saving" })).toBeDisabled();
    await act(async () => resolveUpdate({ data: { outcome: "updated", reference: fixture().reference, status: "approved" }, error: null }));
    expect(await screen.findByText("Request updated.")).toBeInTheDocument();
  });

  it("limits agent status options to the database-permitted in-progress transition", async () => {
    rangeMock.mockResolvedValue({ data: [fixture()], error: null, count: 1 });
    render(<KakandeRequests canUpdateRequests />);
    await screen.findByText("KMR-20261018-0123456789ABCDEF");
    const statusSelect = screen.getByRole("combobox", { name: "Request status for KMR-20261018-0123456789ABCDEF" });
    expect(statusSelect).toHaveTextContent("Pending");
    expect(statusSelect).toHaveTextContent("In progress");
    expect(statusSelect).not.toHaveTextContent("Approved by Luskam");
    expect(statusSelect).not.toHaveTextContent("Rejected by Luskam");
  });

  it("rejects an agent attempt to submit an administrator-only status", async () => {
    rangeMock.mockResolvedValue({ data: [fixture()], error: null, count: 1 });
    render(<KakandeRequests canUpdateRequests />);
    await screen.findByText("KMR-20261018-0123456789ABCDEF");
    fireEvent.change(screen.getByRole("combobox", { name: "Request status for KMR-20261018-0123456789ABCDEF" }), { target: { value: "approved" } });
    fireEvent.click(screen.getByRole("button", { name: "Save update" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This update is not permitted");
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

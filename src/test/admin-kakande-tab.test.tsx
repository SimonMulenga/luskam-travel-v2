import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminPage from "@/pages/Admin";

const { fromMock, access } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  access: { user: null as null | { id: string; email: string }, isAdmin: false, isAgent: false, loading: false },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: fromMock } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: access.user, loading: false }) }));
vi.mock("@/hooks/useRoles", () => ({ useRoles: () => ({ isAdmin: access.isAdmin, isAgent: access.isAgent, loading: access.loading }) }));
vi.mock("@/components/Header", () => ({ Header: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/admin/KakandeRequests", () => ({ KakandeRequests: ({ canManageTrips, canUpdateRequests, canApproveRequests }: { canManageTrips: boolean; canUpdateRequests: boolean; canApproveRequests: boolean }) => <div>Kakande list marker{canUpdateRequests && <div>Request updates marker</div>}{canApproveRequests && <div>Request approvals marker</div>}{canManageTrips && <div>Manage Trips marker</div>}</div> }));
vi.mock("@/components/admin/FlightQuoteRequests", () => ({ FlightQuoteRequests: () => <div>Flight quotes marker</div> }));
vi.mock("@/components/admin/FlightQuotationOperations", () => ({ FlightQuotationOperations: () => <div>Quotation operations marker</div> }));
vi.mock("@/components/admin/FlightPricing", () => ({ FlightPricing: () => null }));
vi.mock("@/components/admin/SiteContentEditor", () => ({ SiteContentEditor: () => null }));
vi.mock("@/components/admin/BlogManager", () => ({ BlogManager: () => null }));
vi.mock("@/components/admin/SubscribersList", () => ({ SubscribersList: () => null }));

const adminTree = () => (
  <MemoryRouter initialEntries={["/admin"]}>
    <Routes>
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/auth" element={<div>Auth screen marker</div>} />
    </Routes>
  </MemoryRouter>
);
const renderAdmin = () => render(adminTree());

describe("existing admin dashboard Kakande tab access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    access.user = { id: "synthetic-staff-user", email: "staff@example.test" };
    access.isAdmin = false;
    access.isAgent = false;
    access.loading = false;
    fromMock.mockImplementation((table: string) => {
      const builder = {
        select: () => builder,
        order: () => builder,
        limit: async () => ({ data: [], error: null }),
        then: (resolve: (value: { data: never[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
      };
      if (table !== "bookings" && table !== "user_roles") throw new Error("Unexpected table query");
      return builder;
    });
  });

  it("hides the previous staff dashboard while the next account is being checked", async () => {
    access.isAdmin = true;
    access.isAgent = true;
    const view = renderAdmin();
    fireEvent.click(await screen.findByRole("button", { name: "Quote workflow" }));
    expect(screen.getByText("Quotation operations marker")).toBeInTheDocument();

    access.user = { id: "synthetic-agent-user", email: "agent@example.test" };
    access.loading = true;
    view.rerender(adminTree());
    expect(screen.getByRole("status", { name: "Checking access" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Admin dashboard" })).not.toBeInTheDocument();
    expect(screen.queryByText("Quotation operations marker")).not.toBeInTheDocument();

    access.isAdmin = false;
    access.isAgent = true;
    access.loading = false;
    view.rerender(adminTree());
    expect(await screen.findByRole("heading", { name: "Admin dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Team & roles" })).not.toBeInTheDocument();
    expect(screen.queryByText("Quotation operations marker")).not.toBeInTheDocument();
  });

  it("removes staff dashboard content immediately on sign-out", async () => {
    access.isAdmin = true;
    access.isAgent = true;
    const view = renderAdmin();
    expect(await screen.findByRole("heading", { name: "Admin dashboard" })).toBeInTheDocument();

    access.user = null;
    view.rerender(adminTree());
    expect(screen.queryByRole("heading", { name: "Admin dashboard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Team & roles" })).not.toBeInTheDocument();
    expect(screen.queryByText("Quotation operations marker")).not.toBeInTheDocument();
    expect(screen.getByText("Auth screen marker")).toBeInTheDocument();
  });

  it("keeps the tab behind the existing staff guard and preserves staff sections", async () => {
    const customerView = renderAdmin();
    expect(await screen.findByRole("heading", { name: "Restricted" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kakande Ministries" })).not.toBeInTheDocument();
    customerView.unmount();

    access.isAgent = true;
    const agentView = renderAdmin();
    expect(await screen.findByRole("button", { name: "Bookings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Flight quotes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kakande Ministries" })).toBeInTheDocument();
    await waitFor(() => expect(fromMock).toHaveBeenCalledWith("bookings"));

    fireEvent.click(screen.getByRole("button", { name: "Flight quotes" }));
    expect(screen.getByText("Flight quotes marker")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Kakande Ministries" }));
    expect(screen.getByText("Kakande list marker")).toBeInTheDocument();
    expect(screen.getByText("Request updates marker")).toBeInTheDocument();
    expect(screen.queryByText("Request approvals marker")).not.toBeInTheDocument();
    expect(screen.queryByText("Manage Trips marker")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bookings" }));
    expect(screen.getByRole("heading", { name: "Booking requests" })).toBeInTheDocument();
    agentView.unmount();

    access.isAdmin = true;
    access.isAgent = true;
    renderAdmin();
    expect(await screen.findByRole("button", { name: "Kakande Ministries" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Kakande Ministries" }));
    expect(screen.getByText("Manage Trips marker")).toBeInTheDocument();
    expect(screen.getByText("Request updates marker")).toBeInTheDocument();
    expect(screen.getByText("Request approvals marker")).toBeInTheDocument();
  });
});

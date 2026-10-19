import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminPage from "@/pages/Admin";

const { fromMock, access } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  access: { user: null as null | { id: string; email: string }, isAdmin: false, isAgent: false },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: fromMock } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: access.user, loading: false }) }));
vi.mock("@/hooks/useRoles", () => ({ useRoles: () => ({ isAdmin: access.isAdmin, isAgent: access.isAgent, loading: false }) }));
vi.mock("@/components/Header", () => ({ Header: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/admin/KakandeRequests", () => ({ KakandeRequests: ({ canManageTrips }: { canManageTrips: boolean }) => <div>Kakande list marker{canManageTrips && <div>Manage Trips marker</div>}</div> }));
vi.mock("@/components/admin/FlightQuoteRequests", () => ({ FlightQuoteRequests: () => <div>Flight quotes marker</div> }));
vi.mock("@/components/admin/FlightPricing", () => ({ FlightPricing: () => null }));
vi.mock("@/components/admin/SiteContentEditor", () => ({ SiteContentEditor: () => null }));
vi.mock("@/components/admin/BlogManager", () => ({ BlogManager: () => null }));
vi.mock("@/components/admin/SubscribersList", () => ({ SubscribersList: () => null }));

const renderAdmin = () => render(
  <MemoryRouter initialEntries={["/admin"]}>
    <Routes><Route path="/admin" element={<AdminPage />} /></Routes>
  </MemoryRouter>,
);

describe("existing admin dashboard Kakande tab access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    access.user = { id: "synthetic-staff-user", email: "staff@example.test" };
    access.isAdmin = false;
    access.isAgent = false;
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
  });
});

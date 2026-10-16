import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FlightPricing } from "@/components/admin/FlightPricing";

const { fromMock, pricingRows } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  pricingRows: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: fromMock,
    functions: { invoke: vi.fn() },
  },
}));

describe("admin pricing responsive layout", () => {
  beforeEach(() => {
    pricingRows.splice(0, pricingRows.length, {
      id: "rule-lun-jnb",
      name: "Lusaka to Johannesburg",
      description: null,
      rule_type: "route",
      priority: 50,
      markup_type: "fixed",
      markup_amount: 35,
      currency: "USD",
      airline_code: null,
      origin_airport: "LUN",
      destination_airport: "JNB",
      cabin_class: null,
      is_domestic: null,
      min_ticket_price: null,
      max_ticket_price: null,
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    fromMock.mockImplementation(() => {
      let orderCount = 0;
      const query = {
        select: vi.fn(() => query),
        order: vi.fn(() => {
          orderCount += 1;
          return orderCount === 2 ? Promise.resolve({ data: pricingRows, error: null }) : query;
        }),
      };
      return query;
    });
  });

  it("shows pricing rules as mobile cards with their fields and accessible actions", async () => {
    const { container } = render(<FlightPricing canEdit />);

    expect(await screen.findAllByText("Lusaka to Johannesburg")).toHaveLength(2);
    const card = container.querySelector("article");
    expect(card).not.toBeNull();
    const cardQueries = within(card as HTMLElement);
    expect(cardQueries.getByText("LUN → JNB")).toBeInTheDocument();
    expect(cardQueries.getByText("USD 35")).toBeInTheDocument();
    expect(cardQueries.getByText("50")).toBeInTheDocument();
    expect(cardQueries.getByRole("button", { name: "Deactivate Lusaka to Johannesburg" })).toBeInTheDocument();
    expect(cardQueries.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(cardQueries.getByRole("button", { name: "Duplicate" })).toBeInTheDocument();
    expect(cardQueries.getByRole("button", { name: "Delete" })).toBeInTheDocument();

    const desktopTable = container.querySelector("table");
    expect(desktopTable?.parentElement).toHaveClass("hidden", "md:block");
    expect(container.querySelector(".md\\:hidden article")).toBeInTheDocument();
  });

  it("keeps the edit form fields and save/cancel controls available in a single-column mobile layout", async () => {
    const { container } = render(<FlightPricing canEdit />);
    await screen.findAllByText("Lusaka to Johannesburg");
    const card = container.querySelector("article");
    expect(card).not.toBeNull();
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Rule name")).toHaveValue("Lusaka to Johannesburg");
    expect(screen.getByLabelText("Markup type")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save rule" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByLabelText("Rule name").parentElement?.parentElement).toHaveClass("grid-cols-1", "sm:grid-cols-2");
  });
});

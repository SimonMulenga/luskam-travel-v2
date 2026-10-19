import { describe, expect, it } from "vitest";
import { buildFlightWorkflowNotification } from "@/lib/flightWorkflowNotifications";

describe("flight workflow notification templates", () => {
  it("builds an escaped quotation email payload without sending it", () => {
    const message = buildFlightWorkflowNotification({
      type: "quotation_issued",
      recipient: "synthetic@example.test",
      reference: "LTA-<unsafe>",
      quotationId: "quote-1",
      revision: 2,
      expiresAt: "2099-11-10T10:00:00Z",
    });
    expect(message.subject).toContain("quotation");
    expect(message.html).toContain("LTA-&lt;unsafe&gt;");
    expect(message.html).not.toContain("LTA-<unsafe>");
    expect(message.idempotencyKey).toBe("quotation_issued:quote-1:2:event");
    expect(message.text).toContain("not an airline reservation");
  });

  it("keeps ticket wording tied to the recorded ticket event", () => {
    const message = buildFlightWorkflowNotification({
      type: "booking_status_updated",
      recipient: "synthetic@example.test",
      reference: "LTA-SYNTHETIC",
      bookingId: "booking-1",
      bookingStatus: "processing",
    });
    expect(message.text).toContain("processing");
    expect(message.text).toContain("not an airline reservation");
    expect(message.subject).not.toContain("ticket was issued");
  });
});

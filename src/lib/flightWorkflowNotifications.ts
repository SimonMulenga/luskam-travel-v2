export type FlightWorkflowNotificationType =
  | "quotation_issued"
  | "quotation_expiry_reminder"
  | "quotation_accepted"
  | "quotation_declined"
  | "booking_request_created"
  | "booking_status_updated"
  | "ticket_issued";

export type FlightWorkflowNotification = {
  type: FlightWorkflowNotificationType;
  recipient: string;
  idempotencyKey: string;
  subject: string;
  text: string;
  html: string;
};

export type FlightWorkflowNotificationInput = {
  type: FlightWorkflowNotificationType;
  recipient: string;
  reference: string;
  quotationId?: string;
  revision?: number;
  expiresAt?: string;
  bookingId?: string;
  bookingStatus?: string;
};

/** Server-side adapter contracts; browser code must not implement provider delivery. */
export interface FlightWorkflowNotificationOutbox {
  enqueue(notification: FlightWorkflowNotification): Promise<void>;
}

export interface FlightWorkflowNotificationProvider {
  deliver(notification: FlightWorkflowNotification, idempotencyKey: string): Promise<void>;
}

const copy: Record<FlightWorkflowNotificationType, { subject: string; intro: string }> = {
  quotation_issued: { subject: "Your Luskam flight quotation is ready", intro: "A flight quotation has been prepared for your request." },
  quotation_expiry_reminder: { subject: "Your Luskam flight quotation expires soon", intro: "A reminder that your flight quotation will expire soon." },
  quotation_accepted: { subject: "Your quotation acceptance was received", intro: "Your acceptance has created a booking request for the Luskam team to process." },
  quotation_declined: { subject: "Your quotation response was received", intro: "Your response to the Luskam flight quotation has been recorded." },
  booking_request_created: { subject: "Your flight booking request was received", intro: "Your booking request is with the Luskam team for processing." },
  booking_status_updated: { subject: "Your Luskam booking request was updated", intro: "The status of your booking request has changed." },
  ticket_issued: { subject: "Your airline ticket was issued", intro: "Luskam has recorded that a supplier confirmed your booking and issued a ticket." },
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

/** Pure template builder. It never contacts a notification provider. */
export function buildFlightWorkflowNotification(input: FlightWorkflowNotificationInput): FlightWorkflowNotification {
  const template = copy[input.type];
  const reference = input.reference.trim();
  const details = [
    `Request reference: ${reference}`,
    input.revision ? `Quotation revision: ${input.revision}` : undefined,
    input.expiresAt ? `Quotation expiry: ${input.expiresAt}` : undefined,
    input.bookingStatus ? `Booking request status: ${input.bookingStatus.replaceAll("_", " ")}` : undefined,
    "A booking request is not an airline reservation. A ticket is issued only after manual supplier confirmation.",
  ].filter(Boolean).join("\n");
  const html = `<main><h1>${escapeHtml(template.subject)}</h1><p>${escapeHtml(template.intro)}</p><p>${escapeHtml(details).replaceAll("\n", "<br>")}</p><p>A booking request is not an airline reservation or ticket.</p></main>`;
  const entity = input.bookingId ?? input.quotationId ?? reference;
  const idempotencyKey = `${input.type}:${entity}:${input.revision ?? "current"}:${input.bookingStatus ?? "event"}`;
  return { type: input.type, recipient: input.recipient, idempotencyKey, subject: template.subject, text: `${template.intro}\n\n${details}`, html };
}

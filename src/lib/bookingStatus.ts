export type StatusTone = "amber" | "emerald" | "rose" | "slate" | "blue";

const bookingStatuses: Record<string, { label: string; description: string; tone: StatusTone }> = {
  pending: { label: "Request received", description: "Awaiting review by our travel team", tone: "amber" },
  confirmed: { label: "Request approved", description: "Luskam marked this request approved. This does not confirm an airline reservation or ticket issuance.", tone: "emerald" },
  completed: { label: "Request completed", description: "This request is marked complete. Check directly with Luskam for supplier and ticket status.", tone: "blue" },
  cancelled: { label: "Cancelled", description: "This booking was cancelled", tone: "rose" },
  failed: { label: "Failed", description: "This booking was marked failed", tone: "rose" },
};

const paymentStatuses: Record<string, { label: string; description: string; tone: StatusTone }> = {
  pending: { label: "Payment not requested", description: "Do not pay until Luskam confirms the quotation and sends verified payment instructions.", tone: "amber" },
  paid: { label: "Payment recorded", description: "Payment is recorded. This does not confirm an airline reservation or ticket issuance.", tone: "emerald" },
  refunded: { label: "Refunded", description: "Payment is marked as refunded", tone: "slate" },
};

const readable = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function bookingStatus(value: string) {
  return bookingStatuses[value.toLowerCase()] ?? {
    label: readable(value) || "Status unavailable",
    description: "Current status as returned by the booking record",
    tone: "slate" as const,
  };
}

export function paymentStatus(value: string, amount?: number) {
  if (value.toLowerCase() === "pending" && amount !== undefined && Number(amount) <= 0) {
    return { label: "Price pending", description: "No payment is due until the travel team confirms availability and price", tone: "slate" as const };
  }
  return paymentStatuses[value.toLowerCase()] ?? {
    label: readable(value) || "Status unavailable",
    description: "Current payment status as returned by the booking record",
    tone: "slate" as const,
  };
}

export function statusToneClass(tone: StatusTone) {
  return {
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    emerald: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    rose: "bg-rose-50 text-rose-800 ring-rose-200",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    blue: "bg-sky-50 text-sky-800 ring-sky-200",
  }[tone];
}

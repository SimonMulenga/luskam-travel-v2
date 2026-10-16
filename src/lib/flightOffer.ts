// Selected flight offer handoff between the results page and checkout.
// Offers come from the server (provider service layer) — never generated client-side.
export interface SelectedOffer {
  id: string;
  airline: string;
  code: string;
  from: string;
  to: string;
  depart: string;
  arrive: string;
  duration: string;
  stops: string;
  cabin: string;
  price: number | null;
  currency: string | null;
  fareType: string;
  priced: boolean;
  status?: string | null;
  providerReference?: string | null;
}

const KEY = "luskam.selectedOffer";

export const storeOffer = (offer: SelectedOffer) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(offer));
  } catch {
    /* ignore */
  }
};

export const readOffer = (id: string): SelectedOffer | null => {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SelectedOffer;
    return parsed && parsed.id === id ? parsed : null;
  } catch {
    return null;
  }
};

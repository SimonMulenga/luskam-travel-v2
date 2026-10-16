import { AIRPORTS, getAirport } from "@/data/airports";

export interface FlightOffer {
  id: string;
  airline: string;
  code: string;
  from: string;
  to: string;
  depart: string; // HH:mm
  arrive: string;
  duration: string;
  stops: string;
  cabin: string;
  price: number;
  fareType: "Economy Promo" | "Economy Semi-Flex" | "Economy Flex" | string;
  live?: boolean;
  status?: string;
}

const AIRLINES = [
  { name: "Emirates", prefix: "EK" },
  { name: "Qatar Airways", prefix: "QR" },
  { name: "Ethiopian Airlines", prefix: "ET" },
  { name: "Kenya Airways", prefix: "KQ" },
  { name: "South African Airways", prefix: "SA" },
  { name: "Proflight Zambia", prefix: "P0" },
  { name: "Turkish Airlines", prefix: "TK" },
  { name: "RwandAir", prefix: "WB" },
];

const HUBS: Record<string, string> = {
  EK: "DXB", QR: "DOH", ET: "ADD", KQ: "NBO", SA: "JNB", P0: "LUN", TK: "IST", WB: "KGL",
};

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function addMinutes(t: string, mins: number) {
  const [h, m] = t.split(":").map(Number);
  const total = (h * 60 + m + mins + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function generateFlights(from: string, to: string, depart: string, cabin: string): FlightOffer[] {
  const seed = hash(`${from}-${to}-${depart}`);
  const offers: FlightOffer[] = [];
  for (let i = 0; i < 5; i++) {
    const al = AIRLINES[(seed + i * 7) % AIRLINES.length];
    const direct = al.prefix === "P0" || (seed + i) % 3 === 0;
    const hub = HUBS[al.prefix];
    const baseDur = 90 + ((seed >> i) % 240);
    const layover = direct ? 0 : 60 + ((seed >> (i + 2)) % 180);
    const totalMin = baseDur + layover + (direct ? 0 : 60);
    const departTime = `${String(5 + ((seed + i * 3) % 18)).padStart(2, "0")}:${String((seed * (i + 1)) % 60).padStart(2, "0")}`;
    const arriveTime = addMinutes(departTime, totalMin);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const basePrice = 280 + ((seed + i * 53) % 700);
    const fares: FlightOffer["fareType"][] = ["Economy Promo", "Economy Semi-Flex", "Economy Flex"];
    const fareIdx = i % 3;
    const mult = [1, 1.18, 1.65][fareIdx];
    offers.push({
      id: `${al.prefix}-${i}-${seed}`,
      airline: al.name,
      code: `${al.prefix} ${100 + ((seed + i * 11) % 900)}`,
      from,
      to,
      depart: departTime,
      arrive: arriveTime,
      duration: `${h}h ${m}m`,
      stops: direct ? "Direct" : `1 stop · ${hub}`,
      cabin,
      price: Math.round(basePrice * mult),
      fareType: fares[fareIdx],
    });
  }
  return offers.sort((a, b) => a.price - b.price);
}

export function airportLabel(code: string) {
  const a = getAirport(code);
  return a ? `${a.city} (${a.code})` : code;
}

export { AIRPORTS };

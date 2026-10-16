export type Airport = { code: string; name: string; city: string; country: string };

export const AIRPORTS: Airport[] = [
  { code: "LUN", name: "Kenneth Kaunda International", city: "Lusaka", country: "Zambia" },
  { code: "LVI", name: "Harry Mwanga Nkumbula International", city: "Livingstone", country: "Zambia" },
  { code: "NLA", name: "Simon Mwansa Kapwepwe International", city: "Ndola", country: "Zambia" },
  { code: "MFU", name: "Mfuwe Airport", city: "Mfuwe", country: "Zambia" },
  { code: "JNB", name: "O. R. Tambo International", city: "Johannesburg", country: "South Africa" },
  { code: "CPT", name: "Cape Town International", city: "Cape Town", country: "South Africa" },
  { code: "DUR", name: "King Shaka International", city: "Durban", country: "South Africa" },
  { code: "HRE", name: "Robert Gabriel Mugabe International", city: "Harare", country: "Zimbabwe" },
  { code: "VFA", name: "Victoria Falls Airport", city: "Victoria Falls", country: "Zimbabwe" },
  { code: "NBO", name: "Jomo Kenyatta International", city: "Nairobi", country: "Kenya" },
  { code: "DAR", name: "Julius Nyerere International", city: "Dar es Salaam", country: "Tanzania" },
  { code: "ZNZ", name: "Abeid Amani Karume International", city: "Zanzibar", country: "Tanzania" },
  { code: "ADD", name: "Bole International", city: "Addis Ababa", country: "Ethiopia" },
  { code: "EBB", name: "Entebbe International", city: "Entebbe", country: "Uganda" },
  { code: "KGL", name: "Kigali International", city: "Kigali", country: "Rwanda" },
  { code: "LAD", name: "Quatro de Fevereiro", city: "Luanda", country: "Angola" },
  { code: "WDH", name: "Hosea Kutako International", city: "Windhoek", country: "Namibia" },
  { code: "GBE", name: "Sir Seretse Khama International", city: "Gaborone", country: "Botswana" },
  { code: "MPM", name: "Maputo International", city: "Maputo", country: "Mozambique" },
  { code: "DXB", name: "Dubai International", city: "Dubai", country: "UAE" },
  { code: "DOH", name: "Hamad International", city: "Doha", country: "Qatar" },
  { code: "IST", name: "Istanbul Airport", city: "Istanbul", country: "Turkey" },
  { code: "LHR", name: "Heathrow", city: "London", country: "United Kingdom" },
  { code: "CDG", name: "Charles de Gaulle", city: "Paris", country: "France" },
  { code: "FRA", name: "Frankfurt", city: "Frankfurt", country: "Germany" },
  { code: "AMS", name: "Schiphol", city: "Amsterdam", country: "Netherlands" },
  { code: "JFK", name: "John F. Kennedy International", city: "New York", country: "USA" },
  { code: "BOM", name: "Chhatrapati Shivaji Maharaj International", city: "Mumbai", country: "India" },
  { code: "PEK", name: "Beijing Capital International", city: "Beijing", country: "China" },
  { code: "CAI", name: "Cairo International", city: "Cairo", country: "Egypt" },
];

export const findAirport = (q: string) => {
  const s = q.trim().toLowerCase();
  if (!s) return AIRPORTS.slice(0, 8);
  return AIRPORTS.filter(
    (a) =>
      a.code.toLowerCase().includes(s) ||
      a.city.toLowerCase().includes(s) ||
      a.country.toLowerCase().includes(s) ||
      a.name.toLowerCase().includes(s)
  ).slice(0, 8);
};

export const getAirport = (code: string) => AIRPORTS.find((a) => a.code === code);

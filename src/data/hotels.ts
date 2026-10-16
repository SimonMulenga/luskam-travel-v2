export interface Hotel {
  id: string;
  name: string;
  city: string;
  area: string;
  pricePerNight: number;
  image: string;
  amenities: string[];
}

const IMG = "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=70";
const IMG2 = "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=70";
const IMG3 = "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=800&q=70";
const IMG4 = "https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=800&q=70";

export function generateHotels(dest: string): Hotel[] {
  const city = dest.split(",")[0].trim() || "Lusaka";
  return [
    { id: "h1", name: `Example city-centre stay · ${city}`, city, area: "City Centre", pricePerNight: 189, image: IMG, amenities: ["WiFi", "Pool", "Breakfast"] },
    { id: "h2", name: `Example airport-district stay · ${city}`, city, area: "Airport District", pricePerNight: 142, image: IMG2, amenities: ["WiFi", "Shuttle"] },
    { id: "h3", name: `Example business-district stay · ${city}`, city, area: "Business District", pricePerNight: 168, image: IMG3, amenities: ["WiFi", "Gym", "Parking"] },
    { id: "h4", name: `Example boutique stay · ${city}`, city, area: "Old Town", pricePerNight: 224, image: IMG4, amenities: ["WiFi", "Spa", "Restaurant"] },
    { id: "h5", name: `Example suburban stay · ${city}`, city, area: "Suburb", pricePerNight: 98, image: IMG, amenities: ["WiFi", "Parking"] },
  ];
}

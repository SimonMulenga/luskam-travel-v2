export interface CarOffer {
  id: string;
  brand: string;
  model: string;
  category: string;
  seats: number;
  bags: number;
  transmission: "Automatic" | "Manual";
  airCon: boolean;
  pricePerDay: number;
  supplier: string;
  image: string;
}

const IMG = "https://images.unsplash.com/photo-1549924231-f129b911e442?auto=format&fit=crop&w=600&q=70";
const IMG2 = "https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=600&q=70";
const IMG3 = "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=600&q=70";
const IMG4 = "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=600&q=70";

export const CARS: CarOffer[] = [
  { id: "c1", brand: "Toyota", model: "Corolla", category: "Economy", seats: 5, bags: 2, transmission: "Automatic", airCon: true, pricePerDay: 38, supplier: "Europcar", image: IMG },
  { id: "c2", brand: "Volkswagen", model: "Polo", category: "Compact", seats: 5, bags: 2, transmission: "Manual", airCon: true, pricePerDay: 32, supplier: "Avis", image: IMG2 },
  { id: "c3", brand: "Toyota", model: "Hilux 4x4", category: "SUV", seats: 5, bags: 4, transmission: "Manual", airCon: true, pricePerDay: 78, supplier: "Hertz", image: IMG3 },
  { id: "c4", brand: "Mercedes-Benz", model: "C-Class", category: "Premium", seats: 5, bags: 3, transmission: "Automatic", airCon: true, pricePerDay: 124, supplier: "Sixt", image: IMG4 },
  { id: "c5", brand: "Hyundai", model: "Tucson", category: "SUV", seats: 5, bags: 3, transmission: "Automatic", airCon: true, pricePerDay: 64, supplier: "Budget", image: IMG3 },
];

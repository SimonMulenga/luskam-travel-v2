export interface PricingRule {
  id: string; name: string; rule_type: string; priority: number;
  markup_type: "fixed" | "percentage"; markup_amount: number; currency: string;
  airline_code: string | null; origin_airport: string | null; destination_airport: string | null;
  cabin_class: string | null; is_domestic: boolean | null;
  min_ticket_price: number | null; max_ticket_price: number | null;
  valid_from: string | null; valid_until: string | null; is_active: boolean;
}
export interface PriceContext {
  supplierPrice: number; airlineCode?: string; origin?: string; destination?: string;
  cabin?: string; isDomestic?: boolean;
}
export interface PricedResult {
  supplier_price: number; markup_amount: number; customer_price: number;
  pricing_rule_id: string | null; pricing_rule_name: string | null;
}

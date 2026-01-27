export interface ExtractedPurchaseDetails {
  order_id: string | null;
  order_date: string | null;
  merchant_name: string | null;
  items: ExtractedItem[];
  subtotal: ExtractedAmount | null;
  tax: ExtractedAmount | null;
  shipping_cost: ExtractedAmount | null;
  discount: ExtractedAmount | null;
  total: ExtractedAmount | null;
  payment_method: string | null;
  card_last_four: string | null;
  billing_address: string | null;
  confirmation_number: string | null;
  transaction_id: string | null;
  raw_signals: string[];
}

export interface ExtractedItem {
  name: string;
  quantity: number | null;
  unit_price: ExtractedAmount | null;
  total_price: ExtractedAmount | null;
}

export interface ExtractedAmount {
  value: number;
  currency: string;
  formatted: string;
}

export interface ExtractedShippingDetails {
  tracking_number: string | null;
  carrier: ShippingCarrier | null;
  carrier_name: string | null;
  tracking_url: string | null;
  status: ShippingStatus | null;
  estimated_delivery: string | null;
  shipped_date: string | null;
  delivery_date: string | null;
  origin: string | null;
  destination: string | null;
  items_shipped: string[];
  raw_signals: string[];
}

export type ShippingCarrier =
  | "ups"
  | "fedex"
  | "usps"
  | "dhl"
  | "amazon"
  | "ontrac"
  | "lasership"
  | "other";

export type ShippingStatus =
  | "label_created"
  | "shipped"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "exception"
  | "unknown";

export interface EmailExtractionResult {
  has_purchase_details: boolean;
  has_shipping_details: boolean;
  purchase: ExtractedPurchaseDetails | null;
  shipping: ExtractedShippingDetails | null;
  extracted_at: number;
}

export const CARRIER_TRACKING_URLS: Record<ShippingCarrier, string> = {
  ups: "https://www.ups.com/track?tracknum=",
  fedex: "https://www.fedex.com/fedextrack/?trknbr=",
  usps: "https://tools.usps.com/go/TrackConfirmAction?tLabels=",
  dhl: "https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=",
  amazon: "https://www.amazon.com/gp/css/shiptrack/view.html?trackingId=",
  ontrac: "https://www.ontrac.com/tracking/?number=",
  lasership: "https://www.lasership.com/track/",
  other: "",
};

export const CARRIER_NAMES: Record<ShippingCarrier, string> = {
  ups: "UPS",
  fedex: "FedEx",
  usps: "USPS",
  dhl: "DHL",
  amazon: "Amazon Logistics",
  ontrac: "OnTrac",
  lasership: "LaserShip",
  other: "Carrier",
};

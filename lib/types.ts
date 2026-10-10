export type Currency = "MXN" | "USD";
export type Category = "comida" | "transporte" | "hospedaje" | "otro";

export const CATEGORIES: { value: Category; label: string; emoji: string }[] = [
  { value: "comida", label: "Comida", emoji: "🍽️" },
  { value: "transporte", label: "Transporte", emoji: "🚕" },
  { value: "hospedaje", label: "Hospedaje", emoji: "🏨" },
  { value: "otro", label: "Otro", emoji: "🧾" },
];

export type Profile = { id: string; display_name: string };

export type Trip = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  per_diem_usd: number;
};

export type Expense = {
  id: string;
  trip_id: string;
  user_id: string;
  date: string;
  merchant: string;
  category: Category;
  amount: number;
  currency: Currency;
  fx_rate: number;
  amount_usd: number;
  receipt_path: string | null;
  uploaded: boolean;
  group_receipt_id: string | null;
  notes: string | null;
  created_at: string;
};

export type GroupReceipt = {
  id: string;
  trip_id: string;
  created_by: string;
  date: string;
  merchant: string;
  category: Category;
  total_amount: number | null;
  currency: Currency;
  fx_rate: number;
  receipt_path: string | null;
  guests: string[];
  created_at: string;
};

export type GroupRequest = {
  id: string;
  status: "pending" | "confirmed" | "declined";
  group: GroupReceipt;
};

export type ScanResult = {
  is_receipt: boolean;
  merchant: string;
  total: number | null;
  currency: Currency;
  date: string | null;
  category: Category;
};

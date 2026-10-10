import type { Currency } from "./types";

const num = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fmtUSD(n: number) {
  const sign = n < 0 ? "−" : "";
  return `${sign}US$${num.format(Math.abs(n))}`;
}

export function fmtMoney(n: number, currency: Currency) {
  return currency === "USD" ? fmtUSD(n) : `$${num.format(n)} MXN`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Fecha local del celular en formato YYYY-MM-DD. */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toISO(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(iso: string, days: number) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

/** Lista de fechas YYYY-MM-DD entre start y end, inclusive. */
export function dateRange(start: string, end: string) {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

const dayFmt = new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short" });
const longFmt = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" });

export function fmtDay(iso: string) {
  return dayFmt.format(parseISO(iso)).replace(/\./g, "");
}

export function fmtDayLong(iso: string) {
  const s = longFmt.format(parseISO(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Convierte un texto tipo "1,250.50" o "1250,5" en número. */
export function parseAmount(text: string) {
  const clean = text.replace(/[^\d.,]/g, "");
  if (!clean) return NaN;
  // Si solo hay coma y 1-2 decimales después, es separador decimal.
  const normalized = /^\d+,\d{1,2}$/.test(clean) ? clean.replace(",", ".") : clean.replace(/,/g, "");
  return Number(normalized);
}

export function toUSD(amount: number, currency: Currency, fxRate: number) {
  if (!Number.isFinite(amount)) return 0;
  return currency === "USD" ? amount : Math.round((amount / fxRate) * 100) / 100;
}

/** Id aleatorio que funciona también fuera de HTTPS (crypto.randomUUID no existe ahí). */
export function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto && window.isSecureContext) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

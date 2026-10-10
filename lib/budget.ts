import { dateRange, todayISO } from "./format";
import type { Expense, Trip } from "./types";

export type DaySummary = {
  date: string;
  spent: number;
  remaining: number;
  count: number;
  pendingUpload: number;
  expenses: Expense[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function summarizeDay(date: string, expenses: Expense[], perDiem: number): DaySummary {
  const list = expenses.filter((e) => e.date === date);
  const spent = round2(list.reduce((s, e) => s + Number(e.amount_usd), 0));
  return {
    date,
    spent,
    remaining: round2(perDiem - spent),
    count: list.length,
    pendingUpload: list.filter((e) => !e.uploaded).length,
    expenses: list,
  };
}

export function tripDays(trip: Trip) {
  return dateRange(trip.start_date, trip.end_date);
}

/** Balance acumulado: viático de los días transcurridos menos todo lo gastado en el viaje. */
export function tripBalance(trip: Trip, expenses: Expense[], today = todayISO()) {
  const days = tripDays(trip);
  const elapsed = days.filter((d) => d <= today).length;
  const inTrip = expenses.filter((e) => e.date >= trip.start_date && e.date <= trip.end_date);
  const spent = round2(inTrip.reduce((s, e) => s + Number(e.amount_usd), 0));
  const allowance = round2(elapsed * Number(trip.per_diem_usd));
  return {
    totalDays: days.length,
    elapsed,
    allowance,
    spent,
    balance: round2(allowance - spent),
    totalAllowance: round2(days.length * Number(trip.per_diem_usd)),
  };
}

/** Color según cuánto queda del viático del día. */
export function budgetTone(remaining: number, perDiem: number) {
  if (remaining < 0) return "bad" as const;
  if (remaining < perDiem * 0.25) return "warn" as const;
  return "ok" as const;
}

/**
 * Si una fecha leída de la boleta cae fuera del viaje pero con día y mes invertidos cae dentro
 * (p. ej. 2026-08-10 por "10/8/26" de un recibo en inglés), usamos la invertida.
 */
export function reconcileScanDate(iso: string, trip: Trip | null) {
  if (!trip) return iso;
  const inTrip = (d: string) => d >= trip.start_date && d <= trip.end_date;
  if (inTrip(iso)) return iso;
  const [y, m, d] = iso.split("-");
  const swapped = `${y}-${d}-${m}`;
  return Number(d) <= 12 && inTrip(swapped) ? swapped : iso;
}

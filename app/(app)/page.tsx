"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { ExpenseItem } from "@/components/expense-item";
import { ExpenseSheet } from "@/components/expense-sheet";
import { QuickAdd } from "@/components/quick-add";
import { budgetTone, summarizeDay, tripBalance } from "@/lib/budget";
import { fmtDay, fmtDayLong, fmtUSD, todayISO } from "@/lib/format";
import type { Expense } from "@/lib/types";

const toneText = { ok: "text-ok", warn: "text-warn", bad: "text-bad" };
const toneBar = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" };

export default function HomePage() {
  const { me, trip, expenses, requests } = useApp();
  const [open, setOpen] = useState<Expense | null>(null);
  const today = todayISO();

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-muted">{fmtDayLong(today)}</p>
        <h1 className="text-2xl font-bold">Hola, {me.display_name.split(" ")[0]}</h1>
      </header>

      {requests.length > 0 && (
        <Link href="/pending" className="card flex items-center gap-3 border-accent/40 bg-accent-soft p-4">
          <Users className="size-6 shrink-0 text-accent" />
          <span className="flex-1 text-sm">
            <b>
              {requests.length} boleta{requests.length > 1 ? "s" : ""} grupal{requests.length > 1 ? "es" : ""}
            </b>{" "}
            por confirmar
          </span>
          <ChevronRight className="size-5 text-accent" />
        </Link>
      )}

      {!trip ? (
        <div className="card space-y-3 p-5">
          <h2 className="text-lg font-semibold">Configura el viaje</h2>
          <p className="text-sm text-muted">Pon las fechas del viaje y el viático diario para empezar a llevar la cuenta.</p>
          <Link href="/settings" className="btn-primary w-full">
            Configurar viaje
          </Link>
        </div>
      ) : (
        <>
          <TodayCard expenses={expenses} perDiem={trip.per_diem_usd} today={today} />
          {(today < trip.start_date || today > trip.end_date) && (
            <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">
              Hoy no está dentro del viaje ({fmtDay(trip.start_date)} – {fmtDay(trip.end_date)}).
            </p>
          )}
          <BalanceCard />
          <QuickAdd />
          <section>
            <h2 className="mb-1 font-semibold">Gastos de hoy</h2>
            {(() => {
              const list = expenses.filter((e) => e.date === today);
              return list.length ? (
                <ul className="card divide-y divide-line px-3">
                  {list.map((e) => (
                    <ExpenseItem key={e.id} expense={e} onOpen={setOpen} />
                  ))}
                </ul>
              ) : (
                <p className="card p-4 text-sm text-muted">Aún no hay gastos hoy.</p>
              );
            })()}
          </section>
        </>
      )}

      {open && <ExpenseSheet expense={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function TodayCard({ expenses, perDiem, today }: { expenses: Expense[]; perDiem: number; today: string }) {
  const day = summarizeDay(today, expenses, perDiem);
  const tone = budgetTone(day.remaining, perDiem);
  const pct = Math.min(100, (day.spent / perDiem) * 100);

  return (
    <section className="card p-5">
      <p className="text-sm text-muted">{day.remaining >= 0 ? "Te quedan hoy" : "Te pasaste hoy por"}</p>
      <p className={`text-5xl font-bold tracking-tight tabular-nums ${toneText[tone]}`}>
        {fmtUSD(Math.abs(day.remaining))}
      </p>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-bg">
        <div className={`h-full rounded-full transition-all ${toneBar[tone]}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm text-muted">
        Gastado <b className="text-fg tabular-nums">{fmtUSD(day.spent)}</b> de {fmtUSD(perDiem)}
      </p>
    </section>
  );
}

function BalanceCard() {
  const { trip, expenses } = useApp();
  if (!trip) return null;
  const b = tripBalance(trip, expenses);
  if (b.elapsed === 0) return null;

  return (
    <Link href="/days" className="card flex items-center gap-3 p-4">
      <div className="flex-1">
        <p className="text-sm text-muted">
          Balance del viaje · día {Math.min(b.elapsed, b.totalDays)} de {b.totalDays}
        </p>
        <p className={`text-lg font-semibold ${b.balance >= 0 ? "text-ok" : "text-bad"}`}>
          {b.balance >= 0 ? `Te sobran ${fmtUSD(b.balance)}` : `Te pasaste ${fmtUSD(-b.balance)}`}
        </p>
        <p className="text-xs text-muted">
          {fmtUSD(b.spent)} gastado de {fmtUSD(b.allowance)} acumulado
        </p>
      </div>
      <ChevronRight className="size-5 text-muted" />
    </Link>
  );
}

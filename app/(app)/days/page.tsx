"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { ExpenseItem } from "@/components/expense-item";
import { ExpenseSheet } from "@/components/expense-sheet";
import { QuickAdd } from "@/components/quick-add";
import { useClpRates } from "@/components/use-clp-rates";
import { budgetTone, summarizeDay, tripBalance, tripDays, type DaySummary } from "@/lib/budget";
import { clpRateFor, type ClpRates } from "@/lib/fx-client";
import { fmtCLP, fmtDay, fmtDayShort, fmtUSD, todayISO } from "@/lib/format";
import type { Expense } from "@/lib/types";

const toneText = { ok: "text-ok", warn: "text-warn", bad: "text-bad" };
const toneBar = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" };

export default function DaysPage() {
  const { trip, expenses } = useApp();
  const today = todayISO();
  const [expanded, setExpanded] = useState<string | null>(today);
  const [open, setOpen] = useState<Expense | null>(null);
  const clp = useClpRates();

  if (!trip) {
    return (
      <div className="card space-y-3 p-5">
        <p>Aún no hay viaje configurado.</p>
        <Link href="/settings" className="btn-primary w-full">
          Configurar viaje
        </Link>
      </div>
    );
  }

  const perDiem = trip.per_diem_usd;
  const days = tripDays(trip).map((d) => summarizeDay(d, expenses, perDiem));
  const outside = expenses.filter((e) => e.date < trip.start_date || e.date > trip.end_date);
  const b = tripBalance(trip, expenses, today);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">{trip.name}</h1>
        <p className="text-sm text-muted">
          {fmtDay(trip.start_date)} – {fmtDay(trip.end_date)} · {fmtUSD(perDiem)} por día
        </p>
      </header>

      <section className="card grid grid-cols-3 divide-x divide-line py-3 text-center">
        <Stat label="Gastado" value={fmtUSD(b.spent)} />
        <Stat label="Acumulado" value={fmtUSD(b.allowance)} />
        <Stat
          label={b.balance >= 0 ? "Te sobra" : "Te pasaste"}
          value={fmtUSD(Math.abs(b.balance))}
          className={b.balance >= 0 ? "text-ok" : "text-bad"}
        />
      </section>

      <ul className="space-y-2">
        {days.map((d) => (
          <DayRow
            key={d.date}
            day={d}
            perDiem={perDiem}
            isToday={d.date === today}
            isFuture={d.date > today}
            expanded={expanded === d.date}
            onToggle={() => setExpanded(expanded === d.date ? null : d.date)}
            onOpen={setOpen}
            clp={clp}
          />
        ))}
      </ul>

      {outside.length > 0 && (
        <section>
          <h2 className="mb-1 font-semibold">Fuera de las fechas del viaje</h2>
          <ul className="card divide-y divide-line px-3">
            {outside.map((e) => (
              <ExpenseItem key={e.id} expense={e} onOpen={setOpen} />
            ))}
          </ul>
        </section>
      )}

      {open && <ExpenseSheet expense={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="px-2">
      <p className="text-xs text-muted">{label}</p>
      <p className={`font-semibold tabular-nums ${className}`}>{value}</p>
    </div>
  );
}

function DayRow({
  day,
  perDiem,
  isToday,
  isFuture,
  expanded,
  onToggle,
  onOpen,
  clp,
}: {
  day: DaySummary;
  perDiem: number;
  isToday: boolean;
  isFuture: boolean;
  expanded: boolean;
  onToggle: () => void;
  onOpen: (e: Expense) => void;
  clp: ClpRates | null;
}) {
  const tone = budgetTone(day.remaining, perDiem);
  const pct = Math.min(100, (day.spent / perDiem) * 100);
  const idle = isFuture && day.count === 0;

  return (
    <li className={`card overflow-hidden ${isToday ? "border-accent" : ""}`}>
      <button type="button" onClick={onToggle} className="w-full p-4 text-left">
        <div className="flex items-center gap-2">
          <p className={`font-semibold whitespace-nowrap ${idle ? "text-muted" : ""}`}>{fmtDayShort(day.date)}</p>
          {isToday && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">Hoy</span>
          )}
          <p className="ml-auto text-right whitespace-nowrap">
            <span className={`font-semibold tabular-nums ${idle ? "text-muted" : toneText[tone]}`}>
              {fmtUSD(day.remaining)}
            </span>{" "}
            <span className="text-xs text-muted">queda</span>
          </p>
          <ChevronDown className={`size-5 shrink-0 text-muted transition ${expanded ? "rotate-180" : ""}`} />
        </div>
        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-bg">
          <div className={`h-full rounded-full ${toneBar[tone]}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-muted">
          {day.count} gasto{day.count === 1 ? "" : "s"} · {fmtUSD(day.spent)}
          {day.pendingUpload > 0 && <span className="text-warn"> · {day.pendingUpload} por subir</span>}
        </p>
        {clp && day.spent > 0 && (
          <p className="text-xs text-muted tabular-nums">≈ {fmtCLP(day.spent * clpRateFor(clp, day.date))}</p>
        )}
      </button>
      {expanded && (
        <div className="border-t border-line px-3 pb-3">
          {day.expenses.length > 0 ? (
            <ul className="divide-y divide-line">
              {day.expenses.map((e) => (
                <ExpenseItem key={e.id} expense={e} onOpen={onOpen} />
              ))}
            </ul>
          ) : (
            <p className="py-3 text-sm text-muted">Sin gastos este día.</p>
          )}
          <div className="pt-2">
            <QuickAdd date={day.date} compact />
          </div>
        </div>
      )}
    </li>
  );
}

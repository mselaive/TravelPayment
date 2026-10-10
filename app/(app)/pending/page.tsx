"use client";

import { useState } from "react";
import { PartyPopper } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { ExpenseItem } from "@/components/expense-item";
import { ExpenseSheet } from "@/components/expense-sheet";
import { GroupRequestCard } from "@/components/group-request-card";
import { fmtDay, fmtUSD } from "@/lib/format";
import type { Expense } from "@/lib/types";

export default function PendingPage() {
  const { expenses, requests } = useApp();
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<Expense | null>(null);

  const list = expenses.filter((e) => showAll || !e.uploaded);
  const pendingCount = expenses.filter((e) => !e.uploaded).length;
  const byDay = new Map<string, Expense[]>();
  [...list]
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at))
    .forEach((e) => byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]));

  return (
    <div className="space-y-6">
      {requests.length > 0 && (
        <section>
          <h1 className="mb-2 text-2xl font-bold">Por confirmar</h1>
          <ul className="space-y-3">
            {requests.map((r) => (
              <GroupRequestCard key={r.id} request={r} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Por subir</h1>
            <p className="text-sm text-muted">
              {pendingCount
                ? `${pendingCount} boleta${pendingCount > 1 ? "s" : ""} por subir a la otra app`
                : "Todas las boletas están subidas"}
            </p>
          </div>
          <button type="button" className={`chip ${showAll ? "chip-on" : ""}`} onClick={() => setShowAll(!showAll)}>
            {showAll ? "Ver solo pendientes" : "Ver todas"}
          </button>
        </div>

        {byDay.size === 0 ? (
          <div className="card flex flex-col items-center gap-2 p-8 text-center text-muted">
            <PartyPopper className="size-10 text-ok" />
            <p>¡Nada pendiente! 🎉</p>
          </div>
        ) : (
          <div className="space-y-4">
            {[...byDay.entries()].map(([date, items]) => (
              <div key={date}>
                <p className="mb-1 flex justify-between px-1 text-sm font-medium text-muted">
                  <span className="capitalize">{fmtDay(date)}</span>
                  <span>{fmtUSD(items.reduce((s, e) => s + e.amount_usd, 0))}</span>
                </p>
                <ul className="card divide-y divide-line px-3">
                  {items.map((e) => (
                    <ExpenseItem key={e.id} expense={e} onOpen={setOpen} />
                  ))}
                </ul>
              </div>
            ))}
            <p className="px-1 text-xs text-muted">
              Marca el cuadro cuando ya la hayas subido. Toca un gasto para ver o guardar la foto.
            </p>
          </div>
        )}
      </section>

      {open && <ExpenseSheet expense={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

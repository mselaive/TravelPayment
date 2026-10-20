"use client";

import { Camera, Check, Users } from "lucide-react";
import { fmtCLP, fmtMoney, fmtUSD } from "@/lib/format";
import { clpRateFor } from "@/lib/fx-client";
import { CATEGORIES, type Expense } from "@/lib/types";
import { useApp } from "./app-provider";
import { useClpRates } from "./use-clp-rates";

export function UploadedCheckbox({ expense }: { expense: Expense }) {
  const { setUploaded } = useApp();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={expense.uploaded}
      aria-label={expense.uploaded ? "Marcar como no subida" : "Marcar como subida a la otra app"}
      onClick={(e) => {
        e.stopPropagation();
        setUploaded(expense.id, !expense.uploaded);
      }}
      className={`flex size-8 shrink-0 items-center justify-center rounded-lg border-2 transition active:scale-90 ${
        expense.uploaded ? "border-ok bg-ok text-white" : "border-line bg-bg"
      }`}
    >
      {expense.uploaded && <Check className="size-5" strokeWidth={3} />}
    </button>
  );
}

export function ExpenseItem({
  expense,
  onOpen,
  showCheckbox = true,
}: {
  expense: Expense;
  onOpen: (e: Expense) => void;
  showCheckbox?: boolean;
}) {
  const cat = CATEGORIES.find((c) => c.value === expense.category) ?? CATEGORIES[3];
  const clp = useClpRates();
  return (
    <li className="flex items-center gap-3 py-3">
      {showCheckbox && <UploadedCheckbox expense={expense} />}
      <button type="button" onClick={() => onOpen(expense)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-bg text-xl">{cat.emoji}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{expense.merchant || cat.label}</span>
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs whitespace-nowrap text-muted">
            <span>{expense.currency === "MXN" ? fmtMoney(expense.amount, "MXN") : cat.label}</span>
            {expense.group_receipt_id && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-accent">
                <Users className="size-3" /> grupal
              </span>
            )}
            {!expense.receipt_path && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-warn/15 px-1.5 py-0.5 text-warn">
                <Camera className="size-3" /> sin foto
              </span>
            )}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-semibold tabular-nums">{fmtUSD(expense.amount_usd)}</span>
          {clp && (
            <span className="block text-[11px] text-muted tabular-nums">
              ≈ {fmtCLP(expense.amount_usd * clpRateFor(clp, expense.date))}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

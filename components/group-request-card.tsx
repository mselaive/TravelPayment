"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { fmtDay, fmtMoney, parseAmount } from "@/lib/format";
import type { Currency, GroupRequest } from "@/lib/types";
import { useApp } from "./app-provider";
import { MoneyField, useFxRate } from "./money-input";
import { ReceiptPhoto } from "./receipt-photo";

type Request = GroupRequest & { participants: { user_id: string; status: string }[] };

export function GroupRequestCard({ request }: { request: Request }) {
  const app = useApp();
  const g = request.group;
  const [amountText, setAmountText] = useState("");
  const [currency, setCurrency] = useState<Currency>(g.currency);
  const fx = useFxRate(g.date, g.currency === "MXN" ? g.fx_rate : null);
  const [busy, setBusy] = useState(false);

  const others = request.participants.filter((p) => p.user_id !== app.userId);

  async function respond(accept: boolean) {
    const amount = accept ? parseAmount(amountText || "0") : 0;
    if (accept && !(amount >= 0)) return app.toast("Monto inválido", "bad");
    if (accept && amount === 0 && !window.confirm("¿Confirmas que estuviste pero no pagaste nada?")) return;
    if (!accept && !window.confirm("¿Seguro que no estuviste en esta comida?")) return;
    const rate = currency === "MXN" ? fx.rate : (fx.rate ?? 1);
    if (accept && amount > 0 && !rate) return app.toast("Falta el tipo de cambio", "bad");

    setBusy(true);
    const { error } = await app.supabase.rpc("respond_group_receipt", {
      p_participant_id: request.id,
      p_accept: accept,
      p_amount: amount,
      p_currency: currency,
      p_fx_rate: rate ?? 1,
    });
    setBusy(false);
    if (error) return app.toast("No se pudo responder: " + error.message, "bad");
    await app.refresh();
    app.toast(accept ? "Confirmado ✓" : "Listo, no se te descuenta nada");
  }

  return (
    <li className="card space-y-4 border-accent/40 p-4">
      <div className="flex gap-3">
        {g.receipt_path ? (
          <ReceiptPhoto path={g.receipt_path} className="size-20 shrink-0" />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Users className="size-6" />
          </span>
        )}
        <div className="min-w-0 text-sm">
          <p>
            <b>{app.nameOf(g.created_by)}</b> registró una boleta grupal
          </p>
          <p className="truncate text-base font-semibold">{g.merchant || "Comida juntos"}</p>
          <p className="text-muted">
            {fmtDay(g.date)}
            {g.total_amount != null && <> · Total {fmtMoney(g.total_amount, g.currency)}</>}
          </p>
          <p className="text-muted">
            Con {others.map((p) => app.nameOf(p.user_id)).join(", ")}
            {g.guests.length > 0 && ` + ${g.guests.join(", ")}`}
          </p>
        </div>
      </div>
      <MoneyField
        label="¿Cuánto pagaste tú?"
        value={amountText}
        onChange={setAmountText}
        currency={currency}
        onCurrency={setCurrency}
        fx={fx}
      />
      <div className="flex gap-2">
        <button type="button" className="btn-secondary" onClick={() => respond(false)} disabled={busy}>
          No estuve
        </button>
        <button type="button" className="btn-primary flex-1" onClick={() => respond(true)} disabled={busy}>
          {busy ? "Enviando…" : "Confirmar"}
        </button>
      </div>
    </li>
  );
}

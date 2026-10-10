"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2, Users } from "lucide-react";
import { fmtDay, fmtMoney, parseAmount } from "@/lib/format";
import { prepareReceipt, uploadReceipt } from "@/lib/receipt";
import type { Category, Currency, Expense } from "@/lib/types";
import { useApp } from "./app-provider";
import { UploadedCheckbox } from "./expense-item";
import { CategoryPicker, DateField, TextField } from "./fields";
import { MoneyField, useFxRate } from "./money-input";
import { ReceiptPhoto } from "./receipt-photo";
import { Sheet } from "./sheet";

export function ExpenseSheet({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const app = useApp();
  const current = app.expenses.find((e) => e.id === expense.id) ?? expense;

  const [amountText, setAmountText] = useState(String(expense.amount));
  const [currency, setCurrency] = useState<Currency>(expense.currency);
  const [date, setDate] = useState(expense.date);
  const [merchant, setMerchant] = useState(expense.merchant);
  const [category, setCategory] = useState<Category>(expense.category);
  const [notes, setNotes] = useState(expense.notes ?? "");
  const [receiptPath, setReceiptPath] = useState(expense.receipt_path);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const fx = useFxRate(date, expense.currency === "MXN" ? expense.fx_rate : null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const blob = await prepareReceipt(file);
      const path = await uploadReceipt(app.supabase, app.userId, blob);
      const { error } = await app.supabase.from("expenses").update({ receipt_path: path }).eq("id", expense.id);
      if (error) throw error;
      setReceiptPath(path);
      await app.refresh();
      app.toast("Foto guardada");
    } catch {
      app.toast("No se pudo subir la foto", "bad");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save() {
    const amount = parseAmount(amountText);
    if (!(amount >= 0)) return app.toast("Monto inválido", "bad");
    const rate = currency === "MXN" ? fx.rate : (fx.rate ?? 1);
    if (!rate) return app.toast("Falta el tipo de cambio", "bad");
    setSaving(true);
    const { error } = await app.supabase
      .from("expenses")
      .update({ amount, currency, fx_rate: rate, date, merchant: merchant.trim(), category, notes: notes.trim() || null })
      .eq("id", expense.id);
    setSaving(false);
    if (error) return app.toast("No se pudo guardar", "bad");
    await app.refresh();
    app.toast("Cambios guardados");
    onClose();
  }

  async function remove() {
    if (!window.confirm("¿Borrar este gasto?")) return;
    const { error } = await app.supabase.from("expenses").delete().eq("id", expense.id);
    if (error) return app.toast("No se pudo borrar", "bad");
    if (receiptPath && !expense.group_receipt_id) {
      await app.supabase.storage.from("receipts").remove([receiptPath]);
    }
    await app.refresh();
    app.toast("Gasto borrado");
    onClose();
  }

  return (
    <Sheet title={merchant || "Gasto"} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-xl bg-bg p-3">
          <UploadedCheckbox expense={current} />
          <div className="text-sm">
            <p className="font-medium">{current.uploaded ? "Ya subida a la otra app" : "Falta subirla a la otra app"}</p>
            <p className="text-muted">Toca el cuadro para cambiarlo</p>
          </div>
        </div>

        <div>
          {receiptPath ? (
            <ReceiptPhoto path={receiptPath} className="h-56 w-full" />
          ) : (
            <p className="mb-2 text-sm text-warn">Este gasto aún no tiene foto de la boleta.</p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPhoto(e.target.files?.[0])}
          />
          <button type="button" className="btn-secondary mt-2 w-full" onClick={() => fileRef.current?.click()} disabled={photoBusy}>
            {photoBusy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
            {receiptPath ? "Cambiar foto" : "Agregar foto"}
          </button>
        </div>

        {expense.group_receipt_id && <GroupDetails groupId={expense.group_receipt_id} />}

        <MoneyField
          label="Monto"
          value={amountText}
          onChange={setAmountText}
          currency={currency}
          onCurrency={setCurrency}
          fx={fx}
        />
        <DateField
          value={date}
          onChange={(v) => {
            setDate(v);
            // Nueva fecha → tipo de cambio de ese día (se puede volver a corregir a mano).
            fx.setManual(null);
          }}
          warning={
            app.trip && (date < app.trip.start_date || date > app.trip.end_date)
              ? "⚠️ Fuera de las fechas del viaje: no cuenta en tu viático diario."
              : null
          }
        />
        <TextField label="Comercio" value={merchant} onChange={setMerchant} placeholder="Ej. Tacos El Güero" />
        <CategoryPicker value={category} onChange={setCategory} />
        <TextField label="Nota (opcional)" value={notes} onChange={setNotes} />

        <div className="flex gap-2 pt-1">
          <button type="button" className="btn-secondary text-bad" onClick={remove} aria-label="Borrar gasto">
            <Trash2 className="size-5" />
          </button>
          <button type="button" className="btn-primary flex-1" onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

type GroupDetail = {
  created_by: string;
  date: string;
  total_amount: number | null;
  currency: Currency;
  guests: string[];
  group_participants: {
    user_id: string;
    status: "pending" | "confirmed" | "declined";
    expense: { amount: number; currency: Currency } | null;
  }[];
};

function GroupDetails({ groupId }: { groupId: string }) {
  const { supabase, nameOf } = useApp();
  const [group, setGroup] = useState<GroupDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("group_receipts")
      .select(
        "created_by, date, total_amount, currency, guests, group_participants(user_id, status, expense:expenses!group_participants_expense_id_fkey(amount, currency))",
      )
      .eq("id", groupId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setGroup(data as unknown as GroupDetail);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, supabase]);

  if (!group) return <div className="h-24 animate-pulse rounded-xl bg-bg" />;

  return (
    <div className="rounded-xl bg-accent-soft p-3 text-sm">
      <p className="mb-2 flex items-center gap-1.5 font-semibold text-accent">
        <Users className="size-4" /> Boleta grupal · {fmtDay(group.date)}
        {group.total_amount != null && (
          <span className="ml-auto">Total {fmtMoney(Number(group.total_amount), group.currency)}</span>
        )}
      </p>
      <ul className="space-y-1">
        {group.group_participants.map((p) => (
          <li key={p.user_id} className="flex justify-between">
            <span>
              {nameOf(p.user_id)}
              {p.user_id === group.created_by && <span className="text-muted"> (la registró)</span>}
            </span>
            <span className="text-muted">
              {p.status === "pending"
                ? "⏳ pendiente"
                : p.status === "declined"
                  ? "✗ no estuvo"
                  : p.expense
                    ? `pagó ${fmtMoney(Number(p.expense.amount), p.expense.currency)}`
                    : "✓ no pagó"}
            </span>
          </li>
        ))}
        {group.guests.map((g) => (
          <li key={g} className="flex justify-between">
            <span>{g}</span>
            <span className="text-muted">invitado</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

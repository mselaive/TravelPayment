"use client";

import { useEffect, useState } from "react";
import { Pencil, RotateCcw } from "lucide-react";
import { getFxRate } from "@/lib/fx-client";
import { fmtUSD, parseAmount, toUSD } from "@/lib/format";
import type { Currency } from "@/lib/types";

export function CurrencyToggle({ value, onChange }: { value: Currency; onChange: (c: Currency) => void }) {
  return (
    <div className="grid shrink-0 grid-cols-2 rounded-xl bg-bg p-1 text-sm font-semibold">
      {(["MXN", "USD"] as const).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`rounded-lg px-3 py-2 transition ${value === c ? "bg-accent text-accent-fg shadow-sm" : "text-muted"}`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

/** Tipo de cambio del día (automático) con opción de corregirlo a mano. */
export function useFxRate(date: string, initialManual?: number | null) {
  const [auto, setAuto] = useState<{ date: string; rate: number | null } | null>(null);
  const [manual, setManual] = useState<number | null>(initialManual ?? null);

  useEffect(() => {
    let cancelled = false;
    getFxRate(date).then((rate) => {
      if (!cancelled) setAuto({ date, rate });
    });
    return () => {
      cancelled = true;
    };
  }, [date]);

  const autoRate = auto?.date === date ? auto.rate : null;
  return {
    rate: manual ?? autoRate,
    autoRate,
    isManual: manual != null,
    loading: manual == null && auto?.date !== date,
    failed: manual == null && auto?.date === date && auto.rate == null,
    setManual,
  };
}

export type FxState = ReturnType<typeof useFxRate>;

/** Campo de monto grande + selector de moneda + conversión en vivo. */
export function MoneyField({
  label,
  value,
  onChange,
  currency,
  onCurrency,
  fx,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  currency: Currency;
  onCurrency?: (c: Currency) => void;
  fx: FxState;
  autoFocus?: boolean;
}) {
  const amount = parseAmount(value);
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-2xl font-semibold text-muted">
            $
          </span>
          <input
            className="input py-3.5 pl-8 text-3xl font-bold tabular-nums"
            inputMode="decimal"
            placeholder="0.00"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoFocus={autoFocus}
            enterKeyHint="done"
          />
        </div>
        {onCurrency ? (
          <CurrencyToggle value={currency} onChange={onCurrency} />
        ) : (
          <span className="px-2 text-sm font-semibold text-muted">{currency}</span>
        )}
      </div>
      {currency === "MXN" && <FxLine amount={amount} fx={fx} />}
    </div>
  );
}

function FxLine({ amount, fx }: { amount: number; fx: FxState }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const customRate = fx.isManual && fx.autoRate != null && fx.rate !== fx.autoRate;

  if (editing || fx.failed) {
    return (
      <div className="mt-2 flex items-center gap-2 text-sm">
        <span className="text-muted">{fx.failed && !editing ? "Sin TC automático. " : ""}1 USD =</span>
        <input
          className="input w-24 px-2 py-1.5 text-sm"
          inputMode="decimal"
          placeholder={fx.rate ? String(fx.rate) : "18.50"}
          value={text}
          autoFocus={editing}
          onChange={(e) => setText(e.target.value)}
        />
        <span className="text-muted">MXN</span>
        <button
          type="button"
          className="ml-auto rounded-lg bg-accent-soft px-3 py-1.5 font-medium text-accent"
          onClick={() => {
            const r = parseAmount(text);
            if (r > 0) fx.setManual(r);
            setEditing(false);
          }}
        >
          OK
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-2 text-sm text-muted">
      <span className="font-semibold text-fg">≈ {fmtUSD(fx.rate && amount > 0 ? toUSD(amount, "MXN", fx.rate) : 0)}</span>
      <span>·</span>
      <button
        type="button"
        className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
        onClick={() => {
          setText(fx.rate ? String(fx.rate) : "");
          setEditing(true);
        }}
      >
        {fx.loading ? "buscando TC…" : `TC ${fx.rate?.toFixed(2)}${customRate ? " (manual)" : ""}`}
        <Pencil className="size-3.5" />
      </button>
      {customRate && (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-accent"
          onClick={() => fx.setManual(null)}
          title="Usar el TC del día"
        >
          <RotateCcw className="size-3.5" /> del día
        </button>
      )}
    </div>
  );
}

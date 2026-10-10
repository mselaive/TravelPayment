"use client";

import { fmtDay } from "@/lib/format";
import { CATEGORIES, type Category } from "@/lib/types";

export function CategoryPicker({ value, onChange }: { value: Category; onChange: (c: Category) => void }) {
  return (
    <div>
      <span className="label">Categoría</span>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => onChange(c.value)}
            className={`chip ${value === c.value ? "chip-on" : ""}`}
          >
            <span>{c.emoji}</span> {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DateField({
  label = "Fecha",
  value,
  onChange,
  hint,
  warning,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  warning?: string | null;
}) {
  return (
    <label className="block">
      <span className="label">
        {label} {value && <span className="font-normal">· {fmtDay(value)}</span>}
        {hint && <span className="ml-1 font-normal text-accent">{hint}</span>}
      </span>
      <input
        type="date"
        className="input"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        required
      />
      {warning && <span className="mt-1 block text-xs text-warn">{warning}</span>}
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

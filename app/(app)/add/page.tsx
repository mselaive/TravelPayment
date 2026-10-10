"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImageIcon, Loader2, PenLine, Plus, Sparkles, Users, X } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { CategoryPicker, DateField, TextField } from "@/components/fields";
import { MoneyField, useFxRate } from "@/components/money-input";
import { fmtDay, fmtMoney, parseAmount, todayISO } from "@/lib/format";
import { clearAddIntent, peekAddIntent } from "@/lib/intent";
import { prepareReceipt, scanReceipt, uploadReceipt } from "@/lib/receipt";
import type { Category, Currency } from "@/lib/types";

type Photo = { previewUrl: string; upload: Promise<string | null> };
type Field = "amount" | "currency" | "date" | "merchant" | "category";

const SCAN_TIMEOUT_MS = 45_000;

export default function AddPage() {
  // Next mantiene vivas las pantallas visitadas (<Activity>) y restauraría la boleta anterior.
  // Con esta key cada entrada a "Agregar" empieza un gasto nuevo; con atrás/adelante se conserva el borrador.
  const { bfcacheId } = useRouter();
  return <AddExpense key={bfcacheId} />;
}

function AddExpense() {
  const app = useApp();
  const router = useRouter();
  const [intent] = useState(peekAddIntent);

  const [stage, setStage] = useState<"choose" | "form">(intent.file || intent.manual ? "form" : "choose");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [scanning, setScanning] = useState(Boolean(intent.file));
  const [scanNote, setScanNote] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);

  const [amountText, setAmountText] = useState("");
  const [currency, setCurrency] = useState<Currency>("MXN");
  const [date, setDate] = useState(intent.date ?? todayISO());
  const [dateFromScan, setDateFromScan] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState<Category>("comida");
  const [notes, setNotes] = useState("");

  const [isGroup, setIsGroup] = useState(false);
  const [totalText, setTotalText] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [guests, setGuests] = useState<string[]>([]);
  const [guestText, setGuestText] = useState("");
  const [saving, setSaving] = useState(false);

  const fx = useFxRate(date);
  const touched = useRef(new Set<Field>());
  const started = useRef(false);
  const scanCtrl = useRef<AbortController | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Campos que el usuario ya tocó: el escaneo no los sobrescribe.
  function onAmount(v: string) {
    touched.current.add("amount");
    setAmountText(v);
  }
  function onCurrency(v: Currency) {
    touched.current.add("currency");
    setCurrency(v);
  }
  function onDate(v: string) {
    touched.current.add("date");
    setDate(v);
    setDateFromScan(false);
  }
  function onMerchant(v: string) {
    touched.current.add("merchant");
    setMerchant(v);
  }
  function onCategory(v: Category) {
    touched.current.add("category");
    setCategory(v);
  }

  async function handleFile(file: File) {
    // Si había una lectura en curso (p. ej. "Otra foto"), se descarta.
    scanCtrl.current?.abort("replaced");
    const ctrl = new AbortController();
    scanCtrl.current = ctrl;
    const timer = setTimeout(() => ctrl.abort("timeout"), SCAN_TIMEOUT_MS);

    setStage("form");
    setScanning(true);
    setScanNote(null);
    const blob = await prepareReceipt(file);
    const upload = uploadReceipt(app.supabase, app.userId, blob).catch(() => {
      app.toast("No se pudo subir la foto (se guardará el gasto sin foto)", "bad");
      return null;
    });
    setPhoto({ previewUrl: URL.createObjectURL(blob), upload });

    try {
      const r = await scanReceipt(blob, ctrl.signal);
      const t = touched.current;
      if (r.total != null && !t.has("amount")) {
        setAmountText(String(r.total));
        setTotalText((prev) => prev || String(r.total));
        if (!t.has("currency")) setCurrency(r.currency);
      }
      if (r.merchant && !t.has("merchant")) setMerchant(r.merchant);
      if (!t.has("category")) setCategory(r.category);
      // La fecha impresa en la boleta manda; el día elegido solo se usa si la boleta no trae fecha.
      if (r.date && !t.has("date")) {
        setDate(r.date);
        setDateFromScan(true);
      }
      setScanNote(
        !r.is_receipt
          ? { text: "No parece una boleta: revisa los datos.", tone: "warn" }
          : r.total == null
            ? { text: "No pude leer el total: escríbelo a mano.", tone: "warn" }
            : { text: "Datos leídos de la boleta. Revísalos antes de guardar.", tone: "ok" },
      );
    } catch (e) {
      if (!ctrl.signal.aborted) setScanNote({ text: (e as Error).message, tone: "warn" });
      else if (ctrl.signal.reason === "timeout") {
        setScanNote({ text: "La lectura tardó demasiado: escribe los datos a mano.", tone: "warn" });
      }
    } finally {
      clearTimeout(timer);
      if (scanCtrl.current === ctrl) {
        scanCtrl.current = null;
        setScanning(false);
      }
    }
  }

  function skipScan() {
    scanCtrl.current?.abort("skip");
  }

  // Si venimos de Inicio con la foto ya tomada, procesarla una sola vez.
  useEffect(() => {
    clearAddIntent();
    if (intent.file && !started.current) {
      started.current = true;
      handleFile(intent.file);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const others = app.profiles.filter((p) => p.id !== app.userId);
  const trip = app.trip;
  const amount = parseAmount(amountText);
  const total = parseAmount(totalText);
  const payers = 1 + participants.length;
  const equalShare = isGroup && total > 0 ? Math.round((total / payers) * 100) / 100 : null;
  const outOfTrip = trip && (date < trip.start_date || date > trip.end_date);

  function addGuest() {
    const name = guestText.trim();
    if (name && !guests.includes(name)) setGuests([...guests, name]);
    setGuestText("");
  }

  async function save() {
    if (!trip) return app.toast("Primero configura el viaje en Ajustes", "bad");
    const minAmount = isGroup ? 0 : 0.01;
    if (!(amount >= minAmount)) return app.toast("Escribe el monto", "bad");
    if (isGroup && participants.length === 0 && guests.length === 0) {
      return app.toast("Elige con quién comiste", "bad");
    }
    const rate = currency === "MXN" ? fx.rate : (fx.rate ?? 1);
    if (!rate) return app.toast("Falta el tipo de cambio", "bad");

    setSaving(true);
    const receiptPath = photo ? await photo.upload : null;
    const base = { date, merchant: merchant.trim(), category, currency, fx_rate: rate };

    const { error } = isGroup
      ? await app.supabase.rpc("create_group_receipt", {
          p_trip_id: trip.id,
          p_date: date,
          p_merchant: base.merchant,
          p_category: category,
          p_total: total > 0 ? total : null,
          p_currency: currency,
          p_fx_rate: rate,
          p_my_amount: amount || 0,
          p_receipt_path: receiptPath,
          p_guests: guests,
          p_participants: participants,
          p_notes: notes.trim() || null,
        })
      : await app.supabase.from("expenses").insert({
          ...base,
          trip_id: trip.id,
          user_id: app.userId,
          amount,
          receipt_path: receiptPath,
          notes: notes.trim() || null,
        });

    if (error) {
      setSaving(false);
      console.error(error);
      return app.toast("No se pudo guardar: " + error.message, "bad");
    }
    await app.refresh();
    app.toast(isGroup && participants.length ? "Boleta grupal enviada ✓" : "Gasto guardado ✓");
    // replace: que "atrás" no vuelva al formulario ya guardado.
    router.replace(date === todayISO() ? "/" : "/days");
  }

  if (stage === "choose") {
    return (
      <div className="space-y-5">
        <header>
          <h1 className="text-2xl font-bold">Agregar gasto</h1>
          {intent.date && <p className="text-sm text-muted">Para el {fmtDay(intent.date)}</p>}
        </header>
        <div className="grid gap-3">
          <button type="button" className="card flex items-center gap-4 p-5 text-left" onClick={() => cameraRef.current?.click()}>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-fg">
              <Camera className="size-6" />
            </span>
            <span>
              <span className="block font-semibold">Tomar foto de la boleta</span>
              <span className="text-sm text-muted">Leo el monto, la fecha y el comercio</span>
            </span>
          </button>
          <button type="button" className="card flex items-center gap-4 p-5 text-left" onClick={() => galleryRef.current?.click()}>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <ImageIcon className="size-6" />
            </span>
            <span>
              <span className="block font-semibold">Elegir de la galería</span>
              <span className="text-sm text-muted">Una foto que ya tomaste</span>
            </span>
          </button>
          <button type="button" className="card flex items-center gap-4 p-5 text-left" onClick={() => setStage("form")}>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-bg text-fg">
              <PenLine className="size-6" />
            </span>
            <span>
              <span className="block font-semibold">Escribir sin foto</span>
              <span className="text-sm text-muted">Puedes agregar la foto después</span>
            </span>
          </button>
        </div>
        <FileInputs cameraRef={cameraRef} galleryRef={galleryRef} onFile={handleFile} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{isGroup ? "Boleta grupal" : "Nuevo gasto"}</h1>
        <button type="button" className="rounded-full p-2 text-muted" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))} aria-label="Cancelar">
          <X className="size-6" />
        </button>
      </header>

      {photo ? (
        <div className="card overflow-hidden">
          <div className="relative h-48 bg-bg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.previewUrl} alt="Boleta" className="h-full w-full object-cover" />
            {scanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-white">
                <Loader2 className="size-8 animate-spin" />
                <span className="text-sm font-medium">Leyendo boleta…</span>
                <button
                  type="button"
                  onClick={skipScan}
                  className="mt-1 rounded-full bg-white/20 px-3 py-1.5 text-xs font-medium backdrop-blur"
                >
                  Escribir a mano
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 px-4 py-3 text-sm">
            {scanNote ? (
              <span className={`flex-1 ${scanNote.tone === "ok" ? "text-ok" : "text-warn"}`}>
                {scanNote.tone === "ok" && <Sparkles className="mr-1 inline size-4" />}
                {scanNote.text}
              </span>
            ) : (
              <span className="flex-1 text-muted">{scanning ? "Esto toma unos segundos" : ""}</span>
            )}
            <button type="button" className="font-medium text-accent" onClick={() => cameraRef.current?.click()}>
              Otra foto
            </button>
          </div>
        </div>
      ) : (
        scanning && (
          <div className="card flex items-center gap-3 p-4 text-sm text-muted">
            <Loader2 className="size-5 animate-spin" /> Preparando foto…
          </div>
        )
      )}

      <div className="card space-y-5 p-4">
        <MoneyField
          label={isGroup ? "Lo que pagaste tú" : "Monto"}
          value={amountText}
          onChange={onAmount}
          currency={currency}
          onCurrency={onCurrency}
          fx={fx}
          autoFocus={intent.manual && !intent.file}
        />
        <DateField
          value={date}
          onChange={onDate}
          hint={dateFromScan ? "(de la boleta)" : undefined}
          warning={outOfTrip ? "Esta fecha está fuera de las fechas del viaje." : null}
        />
        <TextField
          label="Comercio"
          value={merchant}
          onChange={onMerchant}
          placeholder="Ej. Tacos El Güero"
        />
        <CategoryPicker value={category} onChange={onCategory} />
      </div>

      <div className="card p-4">
        <label className="flex items-center gap-3">
          <Users className="size-5 text-accent" />
          <span className="flex-1">
            <span className="block font-medium">Boleta grupal</span>
            <span className="text-sm text-muted">Comieron juntos y cada uno pone lo que pagó</span>
          </span>
          <input
            type="checkbox"
            aria-label="Boleta grupal"
            className="peer sr-only"
            checked={isGroup}
            onChange={(e) => {
              setIsGroup(e.target.checked);
              if (e.target.checked && !totalText) setTotalText(amountText);
            }}
          />
          <span className="relative h-7 w-12 rounded-full bg-line transition peer-checked:bg-accent after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
        </label>

        {isGroup && (
          <div className="mt-5 space-y-5 border-t border-line pt-5">
            <MoneyField
              label="Total de la boleta"
              value={totalText}
              onChange={setTotalText}
              currency={currency}
              fx={fx}
            />
            <div>
              <span className="label">¿Quién más estuvo?</span>
              <div className="flex flex-wrap gap-2">
                {others.map((p) => {
                  const on = participants.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`chip ${on ? "chip-on" : ""}`}
                      onClick={() => setParticipants(on ? participants.filter((x) => x !== p.id) : [...participants, p.id])}
                    >
                      {on ? "✓" : "+"} {p.display_name}
                    </button>
                  );
                })}
                {others.length === 0 && (
                  <p className="text-sm text-muted">Tus compañeros aparecerán aquí cuando creen su cuenta.</p>
                )}
              </div>
            </div>
            <div>
              <span className="label">Otros invitados (no usan la app)</span>
              <div className="flex gap-2">
                <input
                  className="input"
                  placeholder="Nombre"
                  value={guestText}
                  onChange={(e) => setGuestText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addGuest();
                    }
                  }}
                />
                <button type="button" className="btn-secondary px-3" onClick={addGuest} aria-label="Agregar invitado">
                  <Plus className="size-5" />
                </button>
              </div>
              {guests.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {guests.map((g) => (
                    <button key={g} type="button" className="chip" onClick={() => setGuests(guests.filter((x) => x !== g))}>
                      {g} <X className="size-3.5" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {equalShare != null && (
              <button
                type="button"
                className="w-full rounded-xl bg-accent-soft px-3 py-2.5 text-sm text-accent"
                onClick={() => onAmount(String(equalShare))}
              >
                Parte igual entre {payers}: <b>{fmtMoney(equalShare, currency)}</b> · usar
              </button>
            )}
            {participants.length > 0 && (
              <p className="text-sm text-muted">
                A {participants.map((id) => app.nameOf(id)).join(" y ")} les llegará una solicitud para confirmar y
                poner cuánto pagaron.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="card p-4">
        <TextField label="Nota (opcional)" value={notes} onChange={setNotes} placeholder="Ej. cena con cliente" />
      </div>

      <div className="sticky bottom-24 z-10">
        <button type="button" className="btn-primary w-full py-4 text-lg shadow-lg" onClick={save} disabled={saving || scanning}>
          {saving ? "Guardando…" : scanning ? "Leyendo boleta…" : isGroup ? "Guardar y enviar" : "Guardar gasto"}
        </button>
      </div>

      <FileInputs cameraRef={cameraRef} galleryRef={galleryRef} onFile={handleFile} />
    </div>
  );
}

function FileInputs({
  cameraRef,
  galleryRef,
  onFile,
}: {
  cameraRef: React.RefObject<HTMLInputElement | null>;
  galleryRef: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
}) {
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) onFile(f);
  };
  return (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handle} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handle} />
    </>
  );
}

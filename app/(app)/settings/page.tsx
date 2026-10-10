"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Share } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { DateField, TextField } from "@/components/fields";
import { addDays, parseAmount, todayISO } from "@/lib/format";

export default function SettingsPage() {
  const app = useApp();
  const router = useRouter();
  const trip = app.trip;

  const [name, setName] = useState(trip?.name ?? "Viaje de trabajo");
  const [start, setStart] = useState(trip?.start_date ?? todayISO());
  const [end, setEnd] = useState(trip?.end_date ?? addDays(todayISO(), 4));
  const [perDiem, setPerDiem] = useState(String(trip?.per_diem_usd ?? 80));
  const [displayName, setDisplayName] = useState(app.me.display_name);
  const [busy, setBusy] = useState(false);

  async function saveTrip(asNew: boolean) {
    const pd = parseAmount(perDiem);
    if (!(pd > 0)) return app.toast("Viático diario inválido", "bad");
    if (end < start) return app.toast("La fecha final es antes que la inicial", "bad");
    if (asNew && !window.confirm("¿Empezar un viaje nuevo? Todos verán el nuevo viaje y sus gastos empezarán de cero.")) {
      return;
    }
    setBusy(true);
    const values = { name: name.trim() || "Viaje de trabajo", start_date: start, end_date: end, per_diem_usd: pd };
    const { error } =
      trip && !asNew
        ? await app.supabase.from("trips").update(values).eq("id", trip.id)
        : await app.supabase.from("trips").insert(values);
    setBusy(false);
    if (error) return app.toast("No se pudo guardar el viaje", "bad");
    await app.refresh();
    app.toast(asNew ? "Viaje nuevo creado" : "Viaje guardado");
  }

  async function saveName() {
    const value = displayName.trim();
    if (!value) return;
    const { error } = await app.supabase.from("profiles").update({ display_name: value }).eq("id", app.userId);
    if (error) return app.toast("No se pudo guardar", "bad");
    await app.refresh();
    app.toast("Nombre guardado");
  }

  async function logout() {
    await app.supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Ajustes</h1>

      <section className="card space-y-4 p-4">
        <div>
          <h2 className="font-semibold">Viaje</h2>
          <p className="text-sm text-muted">Compartido por todos. Cada uno lleva su propio viático.</p>
        </div>
        <TextField label="Nombre" value={name} onChange={setName} />
        <div className="grid grid-cols-2 gap-3">
          <DateField label="Inicio" value={start} onChange={setStart} />
          <DateField label="Fin" value={end} onChange={setEnd} />
        </div>
        <label className="block">
          <span className="label">Viático por día (USD)</span>
          <input className="input" inputMode="decimal" value={perDiem} onChange={(e) => setPerDiem(e.target.value)} />
        </label>
        <button type="button" className="btn-primary w-full" onClick={() => saveTrip(false)} disabled={busy}>
          {trip ? "Guardar viaje" : "Crear viaje"}
        </button>
        {trip && (
          <button type="button" className="w-full py-2 text-sm text-muted underline" onClick={() => saveTrip(true)} disabled={busy}>
            Empezar un viaje nuevo con estos datos
          </button>
        )}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Tu nombre</h2>
        <div className="flex gap-2">
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <button type="button" className="btn-secondary" onClick={saveName}>
            Guardar
          </button>
        </div>
        <p className="text-sm text-muted">
          En el grupo: {app.profiles.map((p) => p.display_name).join(", ")}
        </p>
      </section>

      <section className="card space-y-2 p-4 text-sm">
        <h2 className="flex items-center gap-2 font-semibold">
          <Share className="size-4" /> Instalar en el celular
        </h2>
        <p className="text-muted">
          <b>iPhone:</b> en Safari toca Compartir → “Agregar a pantalla de inicio”.
        </p>
        <p className="text-muted">
          <b>Android:</b> en Chrome toca ⋮ → “Agregar a pantalla principal” o “Instalar app”.
        </p>
      </section>

      <button type="button" className="btn-secondary w-full text-bad" onClick={logout}>
        <LogOut className="size-5" /> Cerrar sesión
      </button>
    </div>
  );
}

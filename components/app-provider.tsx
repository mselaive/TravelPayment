"use client";

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Plane } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { Expense, GroupReceipt, GroupRequest, Profile, Trip } from "@/lib/types";

type Tone = "ok" | "bad";

type AppData = {
  supabase: SupabaseClient;
  userId: string;
  me: Profile;
  profiles: Profile[];
  trip: Trip | null;
  expenses: Expense[];
  requests: (GroupRequest & { participants: { user_id: string; status: string }[] })[];
};

type AppContextValue = AppData & {
  nameOf: (id: string) => string;
  refresh: () => Promise<void>;
  setUploaded: (id: string, uploaded: boolean) => Promise<void>;
  toast: (message: string, tone?: Tone) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = use(AppContext);
  if (!ctx) throw new Error("useApp debe usarse dentro de AppProvider");
  return ctx;
}

const num = (v: unknown) => Number(v ?? 0);

function normalizeExpense(e: Record<string, unknown>): Expense {
  return {
    ...(e as Expense),
    amount: num(e.amount),
    fx_rate: num(e.fx_rate),
    amount_usd: num(e.amount_usd),
  };
}

function normalizeGroup(g: Record<string, unknown>): GroupReceipt {
  return {
    ...(g as GroupReceipt),
    total_amount: g.total_amount == null ? null : num(g.total_amount),
    fx_rate: num(g.fx_rate),
    guests: (g.guests as string[]) ?? [],
  };
}

async function loadAll(supabase: SupabaseClient): Promise<AppData | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  const userId = session.user.id;

  const [profilesRes, tripRes, requestsRes] = await Promise.all([
    supabase.from("profiles").select("id, display_name").order("created_at"),
    supabase
      .from("trips")
      .select("id, name, start_date, end_date, per_diem_usd")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("group_participants")
      .select("id, status, group:group_receipts(*, group_participants(user_id, status))")
      .eq("user_id", userId)
      .eq("status", "pending"),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (tripRes.error) throw tripRes.error;

  const trip: Trip | null = tripRes.data ? { ...tripRes.data, per_diem_usd: num(tripRes.data.per_diem_usd) } : null;

  let expenses: Expense[] = [];
  if (trip) {
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("trip_id", trip.id)
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    expenses = (data ?? []).map(normalizeExpense);
  }

  const profiles = (profilesRes.data ?? []) as Profile[];
  const me = profiles.find((p) => p.id === userId) ?? {
    id: userId,
    display_name: session.user.email?.split("@")[0] ?? "Yo",
  };

  type RawRequest = { id: string; status: GroupRequest["status"]; group: Record<string, unknown> | null };
  const requests = ((requestsRes.data ?? []) as unknown as RawRequest[])
    .filter((r) => r.group)
    .map((r) => {
      const group = r.group as Record<string, unknown>;
      return {
        id: r.id,
        status: r.status,
        group: normalizeGroup(group),
        participants: (group.group_participants as { user_id: string; status: string }[]) ?? [],
      };
    })
    .sort((a, b) => a.group.date.localeCompare(b.group.date));

  return { supabase, userId, me, profiles, trip, expenses, requests };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const supabase = useMemo(() => (hasSupabaseEnv ? createClient() : null), []);
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: Tone }[]>([]);
  const toastId = useRef(0);

  const load = useCallback(
    () =>
      supabase
        ? loadAll(supabase).then(
            (next) => {
              if (!next) {
                router.replace("/login");
                return;
              }
              setData(next);
              setError(null);
            },
            (e: Error) => {
              console.error(e);
              setError(e.message ?? "Error al cargar");
            },
          )
        : Promise.resolve(),
    [supabase, router],
  );

  // Carga inicial y recarga al volver a la app (p. ej. para ver solicitudes nuevas).
  useEffect(() => {
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const refresh = load;

  const toast = useCallback((message: string, tone: Tone = "ok") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  const setUploaded = useCallback(
    async (id: string, uploaded: boolean) => {
      if (!supabase) return;
      const patch = (value: boolean) =>
        setData((d) => d && { ...d, expenses: d.expenses.map((e) => (e.id === id ? { ...e, uploaded: value } : e)) });
      patch(uploaded);
      const { error } = await supabase.from("expenses").update({ uploaded }).eq("id", id);
      if (error) {
        patch(!uploaded);
        toast("No se pudo guardar el cambio", "bad");
      }
    },
    [supabase, toast],
  );

  const nameOf = useCallback(
    (id: string) => data?.profiles.find((p) => p.id === id)?.display_name ?? "Alguien",
    [data?.profiles],
  );

  if (!hasSupabaseEnv) return <SetupNotice />;
  if (!data) return <Splash error={error} onRetry={refresh} />;

  return (
    <AppContext value={{ ...data, nameOf, refresh, setUploaded, toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),0.75rem)] z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-full px-4 py-2.5 text-sm font-medium shadow-lg ${
              t.tone === "ok" ? "bg-fg text-bg" : "bg-bad text-white"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </AppContext>
  );
}

function Splash({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-14 animate-pulse items-center justify-center rounded-2xl bg-accent text-accent-fg">
        <Plane className="size-7" />
      </div>
      {error ? (
        <>
          <p className="text-sm text-bad">No se pudieron cargar los datos: {error}</p>
          <button className="btn-secondary" onClick={onRetry}>
            Reintentar
          </button>
        </>
      ) : (
        <p className="text-sm text-muted">Cargando…</p>
      )}
    </div>
  );
}

function SetupNotice() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-6">
      <h1 className="text-xl font-bold">Falta configurar Supabase</h1>
      <p className="text-sm text-muted">
        Copia <code>.env.local.example</code> a <code>.env.local</code>, completa las variables de Supabase y reinicia
        el servidor. Los pasos están en el README.
      </p>
    </div>
  );
}

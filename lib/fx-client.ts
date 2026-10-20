const cache = new Map<string, Promise<number | null>>();

/** Tipo de cambio (MXN por 1 USD) del día, vía /api/fx. Memoriza por fecha. */
export function getFxRate(date: string): Promise<number | null> {
  let p = cache.get(date);
  if (!p) {
    p = fetch(`/api/fx?date=${date}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { rate?: number } | null) => (j?.rate ? Number(j.rate) : null))
      .catch(() => null);
    p.then((rate) => {
      if (rate == null) cache.delete(date);
    });
    cache.set(date, p);
  }
  return p;
}

export type ClpRates = { rates: Record<string, number>; latest: number };

let clpPromise: Promise<ClpRates | null> | null = null;

/** Dólar observado en pesos chilenos (CLP por 1 USD) del último mes, vía /api/fx?currency=CLP. */
export function getClpRates(): Promise<ClpRates | null> {
  if (!clpPromise) {
    const p: Promise<ClpRates | null> = fetch("/api/fx?currency=CLP")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { rates?: Record<string, number>; latest?: number } | null) =>
        j?.latest ? { rates: j.rates ?? {}, latest: Number(j.latest) } : null,
      )
      .catch(() => null);
    p.then((v) => {
      if (!v) clpPromise = null;
    });
    clpPromise = p;
  }
  return clpPromise;
}

/** CLP por USD de ese día; si no hay (fin de semana, día futuro), el último anterior disponible. */
export function clpRateFor(clp: ClpRates, date: string) {
  if (clp.rates[date]) return clp.rates[date];
  const prior = Object.keys(clp.rates)
    .filter((d) => d <= date)
    .sort()
    .at(-1);
  return prior ? clp.rates[prior] : clp.latest;
}

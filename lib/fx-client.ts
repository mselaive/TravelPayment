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

"use client";

import { useEffect, useState } from "react";
import { getClpRates, type ClpRates } from "@/lib/fx-client";

/** Dólar observado en CLP (se pide una sola vez por sesión y se comparte entre componentes). */
export function useClpRates() {
  const [clp, setClp] = useState<ClpRates | null>(null);
  useEffect(() => {
    let cancelled = false;
    getClpRates().then((v) => {
      if (!cancelled) setClp(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return clp;
}

"use client";

import { useEffect, useState } from "react";
import { ExternalLink, ImageOff } from "lucide-react";
import { useApp } from "./app-provider";

const cache = new Map<string, { url: string; expires: number }>();

export function useSignedUrl(path: string | null) {
  const { supabase } = useApp();
  const cachedUrl = path ? (cache.get(path)?.url ?? null) : null;
  const [loaded, setLoaded] = useState<{ path: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!path) return;
    const cached = cache.get(path);
    if (cached && cached.expires > Date.now()) return;
    let cancelled = false;
    supabase.storage
      .from("receipts")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (data?.signedUrl) cache.set(path, { url: data.signedUrl, expires: Date.now() + 55 * 60 * 1000 });
        if (!cancelled) setLoaded({ path, url: data?.signedUrl ?? null });
      });
    return () => {
      cancelled = true;
    };
  }, [path, supabase]);

  if (!path) return null;
  return loaded?.path === path ? loaded.url : cachedUrl;
}

export function ReceiptPhoto({ path, className = "" }: { path: string; className?: string }) {
  const url = useSignedUrl(path);
  if (!url) {
    return (
      <div className={`flex items-center justify-center rounded-xl bg-bg text-muted ${className}`}>
        <ImageOff className="size-5 animate-pulse" />
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className={`group relative block overflow-hidden rounded-xl bg-bg ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Foto de la boleta" className="h-full w-full object-cover" />
      <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
        <ExternalLink className="size-3" /> Abrir / guardar
      </span>
    </a>
  );
}

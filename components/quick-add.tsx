"use client";

import { useRouter } from "next/navigation";
import { Camera, ImageIcon, PenLine } from "lucide-react";
import { setAddIntent } from "@/lib/intent";

/** Botones grandes para agregar: la cámara se abre aquí mismo, con un toque. */
export function QuickAdd({ date, compact = false }: { date?: string; compact?: boolean }) {
  const router = useRouter();

  const onFile = (file: File | undefined) => {
    if (!file) return;
    setAddIntent({ file, date });
    router.push("/add");
  };

  return (
    <div className={`grid gap-2 ${compact ? "grid-cols-3" : "grid-cols-2"}`}>
      <label className="btn-primary cursor-pointer py-4">
        <Camera className="size-5" />
        Foto
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </label>
      {compact && (
        <label className="btn-secondary cursor-pointer py-4">
          <ImageIcon className="size-5" />
          Galería
          <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      )}
      <button
        type="button"
        className="btn-secondary py-4"
        onClick={() => {
          setAddIntent({ manual: true, date });
          router.push("/add");
        }}
      >
        <PenLine className="size-5" />
        Escribir
      </button>
    </div>
  );
}

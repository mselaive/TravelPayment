/** Logo de la app (el mismo ícono que queda en la pantalla de inicio del celular). */
export function AppLogo({ className = "size-9" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/icons/icon-192.png" alt="" className={`rounded-[28%] shadow-sm ${className}`} />
  );
}

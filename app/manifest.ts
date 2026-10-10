import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Viáticos de viaje",
    short_name: "Viáticos",
    description: "Gastos del viaje de trabajo: US$80 por día, boletas y cuentas compartidas.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f4f2",
    theme_color: "#0f766e",
    lang: "es",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

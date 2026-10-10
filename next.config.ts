import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Las pantallas cargan sus datos en el navegador (tras el login), así que no
    // validamos "instant navigation" salvo en segmentos que lo pidan con `instant`.
    instantInsights: { validationLevel: "manual-warning" },
  },
  // Para probar desde el celular en la misma red Wi-Fi (npm run dev:lan).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

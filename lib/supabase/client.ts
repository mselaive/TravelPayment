import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL } from "./env";

// createBrowserClient ya es singleton en el navegador.
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
}

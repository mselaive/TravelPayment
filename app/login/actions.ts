"use server";

import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string };

const field = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = field(formData, "email").toLowerCase();
  const password = field(formData, "password");
  if (!email || !password) return { error: "Escribe tu email y contraseña" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: error.message.includes("Invalid") ? "Email o contraseña incorrectos" : error.message };
  }
  redirect("/");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const name = field(formData, "name");
  const email = field(formData, "email").toLowerCase();
  const password = field(formData, "password");
  const code = field(formData, "code");

  const invite = process.env.INVITE_CODE?.trim();
  if (!invite) return { error: "Falta configurar INVITE_CODE en el servidor" };
  if (code.toLowerCase() !== invite.toLowerCase()) return { error: "Código de invitación incorrecto" };
  if (!name) return { error: "Escribe tu nombre" };
  if (!email.includes("@")) return { error: "Email inválido" };
  if (password.length < 6) return { error: "La contraseña debe tener al menos 6 caracteres" };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name },
  });
  if (error) {
    const msg = error.message.toLowerCase();
    return { error: msg.includes("already") || msg.includes("registered") ? "Ese email ya tiene cuenta" : error.message };
  }

  const supabase = await createClient();
  const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
  if (loginError) return { error: loginError.message };
  redirect("/");
}

"use client";

import { useActionState, useState } from "react";
import { AppLogo } from "@/components/app-logo";
import { signIn, signUp, type AuthState } from "./actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loginState, loginAction, loginPending] = useActionState<AuthState, FormData>(signIn, {});
  const [signupState, signupAction, signupPending] = useActionState<AuthState, FormData>(signUp, {});

  const isLogin = mode === "login";
  const state = isLogin ? loginState : signupState;
  const pending = isLogin ? loginPending : signupPending;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <AppLogo className="mx-auto mb-4 size-16 shadow-lg" />
        <h1 className="text-2xl font-bold">Viáticos</h1>
        <p className="mt-1 text-sm text-muted">US$80 por día, sin hojas de cálculo</p>
      </div>

      <div className="mb-5 grid grid-cols-2 rounded-xl bg-line/60 p-1 text-sm font-medium">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-lg py-2 transition ${mode === m ? "bg-card shadow-sm" : "text-muted"}`}
          >
            {m === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        ))}
      </div>

      <form action={isLogin ? loginAction : signupAction} className="card space-y-4 p-5" key={mode}>
        {!isLogin && (
          <label className="block">
            <span className="label">Tu nombre</span>
            <input name="name" className="input" placeholder="Matías" autoComplete="given-name" required />
          </label>
        )}
        <label className="block">
          <span className="label">Email</span>
          <input
            name="email"
            type="email"
            className="input"
            placeholder="tu@email.com"
            autoComplete="email"
            inputMode="email"
            required
          />
        </label>
        <label className="block">
          <span className="label">Contraseña</span>
          <input
            name="password"
            type="password"
            className="input"
            autoComplete={isLogin ? "current-password" : "new-password"}
            minLength={6}
            required
          />
        </label>
        {!isLogin && (
          <label className="block">
            <span className="label">Código de invitación</span>
            <input name="code" className="input" placeholder="El que te pasó Matías" autoCapitalize="off" required />
          </label>
        )}

        {state.error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{state.error}</p>}

        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? "Un momento…" : isLogin ? "Entrar" : "Crear cuenta"}
        </button>
      </form>
    </main>
  );
}

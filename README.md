# Viáticos ✈️🧾

App web (instalable en el celular) para llevar los gastos del viaje de trabajo:

- **US$80 por día por persona**: anotas en **MXN o USD** y se convierte solo con el tipo de cambio del día (editable).
- **Foto de la boleta → se lee sola** (monto, fecha, comercio) con Gemini. Si la boleta no trae fecha, eliges el día.
- **Cuánto te queda hoy** y el **balance acumulado** del viaje.
- **Checkbox "ya la subí"** a la otra app, y una lista de **lo que falta subir** (con la foto para descargarla).
- **Boletas grupales**: registras que comieron juntos, pones lo que pagaste tú, y a los demás les llega una
  solicitud para confirmar y poner lo que pagaron ellos. Se pueden agregar invitados que no usan la app.

Stack 100 % gratis: **Next.js 16** en **Vercel (Hobby)** + **Supabase (Free)** + **Gemini API (capa gratuita)** +
tipo de cambio de **Frankfurter** (BCE, sin key).

---

## 1. Supabase (base de datos, login y fotos)

1. Crea una cuenta y un proyecto gratis en <https://supabase.com> (región sugerida: `us-east` o la más cercana).
2. Ve a **SQL Editor → New query**, pega todo el contenido de [`supabase/schema.sql`](supabase/schema.sql) y dale **Run**.
   (Crea tablas, seguridad por usuario, funciones de boletas grupales y el bucket privado `receipts` para las fotos).
3. **Authentication → Sign In / Providers → Email**: desactiva **"Allow new users to sign up"**.
   Las cuentas se crean desde la app con el código de invitación, así nadie más puede registrarse.
4. **Project Settings → API Keys**: copia la **Publishable key** y la **Secret key**.
   **Project Settings → Data API**: copia la **Project URL**.

## 2. Gemini (escaneo de boletas)

1. Entra a <https://aistudio.google.com/apikey> con tu cuenta de Google y crea una API key (gratis).
2. Ojo: en la capa gratuita Google puede usar el contenido enviado para mejorar sus modelos.

## 3. Correr en tu computador

Requiere Node 20.9 o más nuevo (en esta Mac quedó instalado en `~/.local/node22`).

```bash
export PATH=~/.local/node22/bin:$PATH
cp .env.local.example .env.local   # y completa los valores
npm install
npm run dev                        # http://localhost:3000
```

Para probar desde el celular en la misma red Wi-Fi: `npm run dev:lan` y abre `http://<IP-de-tu-Mac>:3000`.

## 4. Publicar en Vercel (gratis)

1. Sube esta carpeta a un repositorio de GitHub (privado está bien).
2. En <https://vercel.com/new> importa el repositorio (framework: Next.js, sin cambiar nada más).
3. En **Environment Variables** agrega las mismas variables de `.env.local`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
   `GEMINI_API_KEY`, `GEMINI_MODEL` (opcional) e `INVITE_CODE`.
4. **Deploy**. Comparte la URL `https://<tu-proyecto>.vercel.app` y el código de invitación con Juan Pablo y Kenny.

## 5. Primer uso

1. Cada uno entra a la URL → **Crear cuenta** (nombre, email, contraseña y código de invitación).
2. Uno configura el viaje en **Ajustes** (fechas y viático diario; queda compartido para todos).
3. Agrégala a la pantalla de inicio:
   - **iPhone**: Safari → Compartir → "Agregar a pantalla de inicio".
   - **Android**: Chrome → ⋮ → "Instalar app".

## Cómo se calcula

- Cada gasto guarda su tipo de cambio (MXN por 1 USD) del día de la boleta; si tu tarjeta cobró otro, tócalo y corrígelo.
- **Te quedan hoy** = viático diario − suma en USD de tus gastos de ese día.
- **Balance del viaje** = viático × días transcurridos − todo lo gastado en el viaje.
- En boletas grupales a **cada uno se le descuenta lo que pagó**. Quien no pagó nada puede confirmar con $0.

## Estructura

```
app/(app)/            pantallas con sesión: Hoy, Agregar, Días, Por subir, Ajustes
app/login/            login y registro con código de invitación (server actions)
app/api/scan/         lee la foto de la boleta con Gemini (solo usuarios logueados)
app/api/fx/           tipo de cambio del día (caché en la tabla fx_rates)
components/           UI compartida y el proveedor de datos (AppProvider)
lib/                  cálculos de presupuesto, formato, compresión de fotos, clientes de Supabase
proxy.ts              refresca la sesión y redirige a /login si no hay sesión
supabase/schema.sql   esquema completo de la base de datos
```

## Límites del plan gratis

- Supabase Free **pausa el proyecto tras 7 días sin uso**; se reactiva desde el dashboard con un clic.
  500 MB de base de datos y 1 GB de fotos (las fotos se comprimen a ~300 KB en el celular).
- Gemini gratis tiene límites por minuto y por día: si se alcanzan, la app avisa y puedes escribir el monto a mano.

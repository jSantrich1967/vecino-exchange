# 💵 Vecino Exchange

Mercado P2P de **USD/USDT entre vecinos** de un condominio venezolano, con **custodia (escrow)
verificada por un administrador**. Las tasas se consultan en vivo desde **Binance P2P** y
**DolarAPI**; la app **registra y ordena** las operaciones, pero **no mueve dinero**: cada pago
se verifica manualmente (capture de Zelle, transferencia de Binance) antes de liberar.

## Lo que incluye la v1

- **📊 Tasas** (`/`): BCV oficial, paralelo, USDT Binance (precio de compra y de venta),
  spread USDT vs paralelo, botón "Copiar para WhatsApp" y aviso honesto cuando los datos
  no están en vivo (muestra últimos valores guardados, nunca inventa números).
- **🤝 Mercado** (`/mercado`): tablón de ofertas abiertas con filtros (compra/venta, método
  de pago: Zelle, Efectivo, Binance, Transferencia), publicar oferta con tasa pre-rellenada
  desde la referencia, y aceptar oferta → crea la operación y cierra la oferta.
- **🔒 Operaciones** (`/operaciones`): stepper visual de custodia en 5 pasos
  (Solicitud → Comprador paga → Vendedor entrega → Custodia confirmada → Liberado),
  botones según tu rol ("Ya pagué" / "Ya entregué"), "Reportar problema" e historial.
- **⚙️ Admin** (`/admin`, solo `profiles.is_admin`): todas las operaciones con acciones por
  estado (confirmar pago/entrega, liberar fondos con cálculo automático de comisión,
  cancelar, resolver disputas), ajuste de comisión %, overrides manuales de tasas,
  resumen de ingresos y lista de usuarios.
- **🔐 Auth**: registro/login con correo vía Supabase Auth. Rutas `/mercado`, `/operaciones`
  y `/admin` protegidas por middleware.

## Flujo de custodia (cómo se gana)

1. Un vecino acepta una oferta → se crea la operación en estado `requested` y la oferta se cierra.
2. El **comprador** marca "Ya pagué" → `awaiting_seller`.
3. El **vendedor** marca "Ya entregué" → `in_escrow` (custodia confirmada por ambas partes).
4. El **administrador** verifica los pagos **fuera de la app** y pulsa **Liberar fondos** →
   `released`, y la app calcula `fee_usd = monto × fee_pct / 100` como ingreso.
5. Cualquiera puede **reportar problema** → `disputed`; solo el admin resuelve.

Los cambios de estado pasan por las funciones Postgres `accept_offer` / `advance_trade`
(`security definer`), que validan quién puede hacer cada cosa. Un usuario no puede
auto-liberarse fondos desde el cliente.

## Tasas en vivo

`GET /api/rates` (solo servidor, caché de 60 s):

- **Binance P2P** `POST p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search`
  (`fiat: VES, asset: USDT`, mejores 5 anuncios de comerciantes):
  - búsqueda `tradeType: "BUY"` → anunciantes **venden** USDT → `usdt_buy_ves` = **mínimo**
    (lo que pagas por comprar 1 USDT);
  - búsqueda `tradeType: "SELL"` → anunciantes **compran** USDT → `usdt_sell_ves` = **máximo**
    (lo que te dan por vender 1 USDT).
- **DolarAPI** `GET ve.dolarapi.com/v1/dolares/oficial` y `/paralelo` → `.promedio`.

Cadena de respaldo: en vivo → último snapshot en `rate_snapshots` → overrides manuales del
admin (`settings`). Si todo falla: `stale: true` y nulls con etiquetas honestas en la UI.

## Puesta en marcha (lo que debes hacer tú)

1. **Crear el proyecto Supabase** en [supabase.com](https://supabase.com) (gratis).
2. **Correr el SQL**: en el SQL Editor pega todo `supabase/schema.sql` y dale Run
   (ver `supabase/README.md`).
3. **Variables de entorno**: copia `.env.example` a `.env.local` con tus claves de Supabase.
4. **URLs de autenticación** (esto es lo que hace funcionar los correos): en Supabase →
   Authentication → URL configuration:
   - **Site URL**: tu dominio de producción (ej. `https://tu-app.vercel.app`).
   - **Redirect URLs**: agrega `https://tu-app.vercel.app/auth/callback` y
     `https://tu-app.vercel.app/actualizar-clave`.
5. **Hacerte admin**: regístrate en la app y luego en el SQL Editor:
   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where email = 'tu-correo@ejemplo.com');
   ```
6. **Desplegar en Vercel**: importa el repo `jSantrich1967/vecino-exchange`, agrega las 3
   variables de entorno y deploy. Listo para compartir el link en el grupo de WhatsApp.

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # completa tus claves
npm run dev                  # http://localhost:3000
npm run build                # debe pasar limpio
```

## Roadmap fase 2

- Trading automatizado con la API de Binance (órdenes reales, no solo tasas).
- Bot de WhatsApp Business: publica tasas cada hora y notifica operaciones.
- KYC ligero de vecinos (verificación de identidad antes de operar montos altos).
- Límites por usuario y reputación (calificaciones post-operación).

## Advertencia

v1 no automatiza movimiento de fondos a propósito. Operar como casa de cambio informal
puede tener implicaciones regulatorias en Venezuela (criptoactivos); consulta con un
abogado antes de escalar y empieza con montos pequeños entre conocidos.

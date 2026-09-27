# Base de datos — Vecino Exchange

## Ejecutar el esquema (una sola vez)

1. Crea un proyecto nuevo en [supabase.com](https://supabase.com) (plan gratis basta).
2. Entra a **SQL Editor** → **New query**.
3. Copia TODO el contenido de `schema.sql`, pégalo y dale **Run**.
4. Verifica que no haya errores (abajo debe decir "Success").

Esto crea: `profiles`, `offers`, `trades`, `trade_events`, `settings` (con `fee_pct = 1.0`
y overrides vacíos), `rate_snapshots`, las políticas RLS, el trigger que crea el perfil
al registrarse, el candado anti auto-admin y las funciones `accept_offer` / `advance_trade`.

## Hacerte admin (obligatorio para /admin)

Después de registrarte en la app con tu correo, corre esto en el SQL Editor
cambiando el correo por el tuyo:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'tu-correo@ejemplo.com');
```

Sin este paso, la página `/admin` te dirá "Acceso denegado".

## Notas

- Las tasas en vivo NO requieren tabla adicional: `/api/rates` guarda snapshots
  automáticamente en `rate_snapshots` usando la service role key.
- Los cambios de estado de las operaciones pasan por `advance_trade`, que valida
  quién puede hacer cada acción (comprador, vendedor o admin). No hay forma de
  que un usuario se auto-libere fondos desde el cliente.

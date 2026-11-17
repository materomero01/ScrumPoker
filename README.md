# Scrum Poker

Planning Poker en tiempo real con mesa de paño: cada persona se sienta alrededor de la mesa, vota en secreto y las cartas se dan vuelta todas juntas.

![Licencia](https://img.shields.io/badge/license-MIT-blue)
![Node.js](https://img.shields.io/badge/node-%3E%3D22-2b7457)

## Qué hace

- **Votos secretos de verdad.** El servidor no envía los valores hasta que se revela la ronda.
- **Resultados útiles.** Carta sugerida (la del mazo más cercana al promedio), promedio, mediana, consenso, distribución de votos y quién votó más alto y más bajo para que lo expliquen.
- **Mazos configurables.** Fibonacci, Fibonacci modificado, talles de remera y potencias de 2.
- **Roles.** Quien crea la sala modera (se puede transferir); el resto vota u observa. Opción para que solo quien modera revele y pase de ronda, y para sacar a alguien.
- **Revelado automático** cuando todos votaron, y **reloj** de ronda sincronizado.
- **Reconexión sin perder el voto.** Cada pestaña tiene una identidad persistente; si se corta la conexión, hay 30 s para volver al mismo asiento.
- **Historial** de rondas con exportación a CSV (protegido contra inyección de fórmulas) o Markdown.
- **Emojis voladores**: tocá la carta de alguien para tirarle uno. Muchos seguidos le hacen vibrar la pantalla.
- Accesible: navegable con teclado (los números del teclado votan, Enter revela), anuncios para lectores de pantalla y respeto de `prefers-reduced-motion`.

## Correr localmente

```bash
npm install
npm run dev     # recarga al guardar
# o
npm start
```

Abrí `http://localhost:3000`, creá una sala y compartí el enlace.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm start` | Levanta el servidor |
| `npm run dev` | Servidor con `--watch` |
| `npm test` | Tests unitarios y de integración (`node:test`) |
| `npm run lint` | ESLint |
| `npm run check` | Lint + tests |

## Configuración

| Variable | Default | Descripción |
| --- | --- | --- |
| `PORT` | `3000` | Puerto HTTP |
| `MAX_ROOMS` | `2000` | Máximo de salas simultáneas en memoria |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` o `silent` |
| `NODE_ENV` | — | Con `development` se habilita `GET /api/debug/rooms` |

Los tiempos y límites (gracia de reconexión, TTL de salas, rate limits) están en `src/config.js`.

## Estructura

```
server.js                 arranque y apagado ordenado
src/
  config.js               constantes y variables de entorno
  app.js                  Express + Socket.IO (sin escuchar, para tests)
  domain/Room.js          lógica pura de una sala
  domain/RoomStore.js     almacén en memoria con TTL y límite
  domain/stats.js         estadísticas de la ronda
  domain/decks.js         mazos disponibles
  socket/handlers.js      eventos de Socket.IO con validación y try/catch
  socket/validate.js      saneamiento de payloads
  http/routes.js          API REST (/api/rooms)
  http/securityHeaders.js CSP y cabeceras de seguridad
public/
  index.html, css/app.css
  js/main.js              estado del cliente y wiring
  js/table.js, hand.js, dialogs.js, emoji.js, net.js, dom.js, export.js
test/                     node:test + socket.io-client
```

## API

- `POST /api/rooms` crea una sala y devuelve `{ roomId }`.
- `GET /api/rooms/:id` devuelve 404 si no existe.
- `GET /healthz` para health checks.

Eventos de Socket.IO (todos con ack `{ ok, error? }`): `join`, `leave`, `vote`, `reveal`, `next_round`, `update_task`, `update_settings`, `set_role`, `timer_start`, `timer_stop`, `kick`, `make_moderator`, `get_history`, más `emoji` (sin ack). El servidor emite `state`, `emoji`, `timer_done`, `kicked` y `session_replaced`.

## CI y auto-merge

`.github/workflows/ci.yml` corre lint y tests en Node 22 y 24 en cada PR. Si pasan, y el PR no es borrador ni viene de un fork, se mergea automáticamente con squash.

Para que funcione, en **Settings → Actions → General → Workflow permissions** tiene que estar habilitado **Read and write permissions**. Si `main` tiene reglas de protección que exigen reviews, el auto-merge va a fallar hasta que haya una aprobación.

## Despliegue

Funciona en Render, Railway o Fly.io con `npm ci` y `npm start`, o con el `Dockerfile` incluido. El estado vive en memoria, así que usá una sola instancia; `RoomStore` está aislado para poder cambiarlo por Redis si hace falta escalar.

## Licencia

MIT

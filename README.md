# ✨ Sparka

**La app de citas gratuita de verdad.** Todas las funciones para todo el mundo: sin planes premium, sin “boosts” y sin trucos para que pagues.

Sparka es una red social de citas al estilo de Tinder (deslizar, hacer match y chatear), pero pensada para conectar mejor:

<p align="center">
  <img src="docs/screenshots/descubrir.png" width="200" alt="Descubrir">
  <img src="docs/screenshots/match.png" width="200" alt="¡Es un match!">
  <img src="docs/screenshots/le-gustas.png" width="200" alt="Le gustas">
  <img src="docs/screenshots/chat.png" width="200" alt="Chat">
</p>

| | Apps de citas habituales | **Sparka** |
|---|---|---|
| Ver quién te ha dado like | Normalmente de pago | ✅ Gratis |
| Likes | Limitados al día | ✅ Ilimitados |
| Deshacer el último swipe | Normalmente de pago | ✅ Gratis |
| Super likes | Muy pocos o de pago | ✅ 3 **Chispas** al día, con mensaje |
| Filtros (edad, distancia, intención) | Avanzados de pago | ✅ Todos gratis |
| Modo incógnito | De pago | ✅ Gratis |
| Por qué te enseña a alguien | Algoritmo opaco | ✅ % de afinidad **con explicación** |
| Perfil | Sobre todo fotos | ✅ Preguntas, intereses e intenciones claras |
| Seguridad | Variable | ✅ Avisos anti-estafa, filtro de insultos, bloqueo y denuncia |

## Funciones

- **Descubrir**: pila de tarjetas con gestos (arrastrar a la derecha = me gusta, izquierda = paso, arriba = Chispa), botones y atajos de teclado (`←` `→` `↑`).
- **Afinidad transparente**: cada perfil muestra un % calculado con intereses en común, intenciones compatibles, distancia y actividad, y te explica *por qué* (“Compartís: senderismo, café”).
- **Le gustas**: mira gratis quién te ha dado like (con su mensaje, si lo envió) y responde desde ahí.
- **Likes con mensaje**: comenta una respuesta concreta del perfil o envía una **Chispa ✨** con un mensaje. Al hacer match, el mensaje abre la conversación.
- **Chat en tiempo real** (Socket.IO): “escribiendo…”, confirmación de lectura (“Visto”), ideas para romper el hielo basadas en lo que tenéis en común.
- **Seguridad**:
  - Si vas a enviar un insulto, Sparka te pide confirmación (“¿Seguro que quieres enviar esto?”).
  - Los mensajes que piden dinero, Bizum, PayPal, cripto, códigos… muestran un **aviso anti-estafa** a quien los recibe.
  - Bloquear y denunciar en un toque (denunciar también bloquea). La otra persona no recibe ningún aviso.
  - Deshacer match: la conversación desaparece para ambas personas.
- **Privacidad**: nunca se expone email, fecha de nacimiento ni ubicación exacta (la distancia se redondea). Modo incógnito: solo te ve quien tú hayas elegido.
- **Perfiles completos**: hasta 6 fotos, hasta 3 preguntas con respuesta, 3–10 intereses, intención (relación seria, algo casual, amistad…).
- **Solo +18**: la fecha de nacimiento se valida en el servidor.
- Diseño móvil primero, modo oscuro automático, accesible con teclado y lector de pantalla.

<p align="center"><img src="docs/screenshots/escritorio-oscuro.png" width="720" alt="Sparka en escritorio, modo oscuro"></p>

## Empezar

Requisitos: **Node.js 22.13 o superior** (usa el SQLite integrado de Node, no hace falta instalar ninguna base de datos).

```bash
npm install
npm run dev
```

Abre **http://localhost:5173**, crea una cuenta y completa tu perfil.

> **Modo demo:** la primera vez se crean ~540 perfiles de ejemplo repartidos por 20 ciudades de España y Latinoamérica para que puedas probarlo todo (algunos ya te habrán dado like, devuelven likes y contestan en el chat). Están **siempre marcados como “Demo”** y no pueden iniciar sesión. Desactívalo en producción con `DEMO_MODE=false`.

### Producción

```bash
npm run build     # compila la web en client/dist
npm start         # sirve web + API + tiempo real en http://localhost:3001
```

O con Docker:

```bash
docker build -t sparka .
docker run -p 3001:3001 -v sparka-data:/data -e DEMO_MODE=false sparka
```

Si lo despliegas detrás de un proxy con HTTPS (Render, Fly.io, Railway, Nginx…), pon `TRUST_PROXY=true` para que las cookies de sesión sean `Secure`.

### Configuración

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `3001` | Puerto del servidor |
| `DB_FILE` | `./data/sparka.db` | Archivo de la base de datos SQLite |
| `UPLOAD_DIR` | `./data/uploads` | Carpeta de las fotos subidas |
| `DEMO_MODE` | `true` | Crea y anima perfiles de ejemplo (marcados como “Demo”) |
| `TRUST_PROXY` | `false` | Actívalo detrás de un proxy HTTPS |

Otros comandos: `npm test` (tests de API, tiempo real y lógica de matching) y `npm run seed` (regenera los perfiles demo).

## Cómo está hecho

```
server/            API (Express 5) + tiempo real (Socket.IO) + SQLite (node:sqlite)
  app.js           Montaje de la app, cabeceras de seguridad, errores
  auth.js          Contraseñas (scrypt), sesiones en cookie httpOnly, rate limiting
  matching.js      Edad, distancia, elegibilidad mutua y cálculo de afinidad
  safety.js        Detección de insultos y de posibles estafas
  demo.js          Perfiles demo y su comportamiento
  routes/          auth · me (perfil, fotos, preferencias) · discover (swipes, likes) · matches (chat) · safety
client/src/        Web (React 19 + Vite)
  pages/           Landing, Onboarding, Discover, Likes, Matches, Chat, Profile
  components/      Tarjeta deslizable, detalle de perfil, formularios, diálogos
tests/             node:test + supertest + socket.io-client
```

### Seguridad implementada

- Contraseñas con **scrypt** y sal aleatoria; comparación en tiempo constante (también cuando el email no existe).
- Sesiones con token aleatorio de 256 bits, guardado **hasheado** en la base de datos; cookie `HttpOnly`, `SameSite=Lax`.
- Límite de intentos en login/registro y de mensajes por minuto.
- Validación estricta de todas las entradas con **zod**.
- Las fotos se validan por su **firma real** (JPG/PNG/WebP), no por lo que dice el navegador, y se guardan con nombres aleatorios.
- Cabeceras de seguridad con **helmet** (CSP incluida).
- Autorización en cada consulta: solo puedes leer/escribir en tus propios matches, y solo puedes dar like a perfiles que podrían verte.

### API

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/auth/register` · `/login` · `/logout` | Cuenta y sesión |
| `GET` / `DELETE` | `/api/me` | Tu perfil privado / borrar cuenta (pide contraseña) |
| `PUT` | `/api/me/profile` · `/api/me/preferences` | Editar perfil y filtros |
| `POST` / `DELETE` | `/api/me/photos[/:id]` · `POST /api/me/photos/:id/main` | Fotos |
| `GET` | `/api/discover` | Perfiles compatibles ordenados por afinidad |
| `POST` | `/api/swipes` · `/api/swipes/undo` | Like, paso o Chispa / deshacer |
| `GET` | `/api/likes` | Quién te ha dado like |
| `GET` / `DELETE` | `/api/matches[/:id]` | Matches / deshacer match |
| `GET` / `POST` | `/api/matches/:id/messages` · `POST …/read` | Chat |
| `POST` | `/api/users/:id/block` · `/api/users/:id/report` | Bloquear y denunciar |

Eventos de Socket.IO: `match:new`, `match:removed`, `likes:changed`, `message:new`, `message:read`, `typing`.

## Próximos pasos

- Verificación de perfil con selfie.
- Notificaciones push y app instalable (PWA).
- Panel de moderación para revisar denuncias.
- Para escalar a muchas instancias: PostgreSQL, almacenamiento de fotos en S3 y adaptador de Redis para Socket.IO.

## Licencia

MIT. Gratis hoy y siempre.

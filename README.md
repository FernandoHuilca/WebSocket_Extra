# 💬 Sala FIS – Chat WebSocket con Firebase

Chat en tiempo real (Node.js + Express + `ws`) con **login en Firebase Authentication**, **mensajes guardados
en Firestore**, **JWT**, **validación de dominio** y **variables de entorno en `.env`**.
Es la parte opcional (+1 punto) del laboratorio *LabWebAv05 – WebSocket*.

> Para entender el plan general mira [`ROADMAP.md`](ROADMAP.md). Este README es la guía práctica paso a paso.

---

## Índice

1. [Qué incluye](#1-qué-incluye)
2. [Estructura del proyecto](#2-estructura-del-proyecto)
3. [Requisitos](#3-requisitos)
4. [Configurar Firebase (paso a paso)](#4-configurar-firebase-paso-a-paso)
5. [Crear tu archivo `.env`](#5-crear-tu-archivo-env)
6. [Probar en tu computadora](#6-probar-en-tu-computadora)
7. [Subir el código a GitHub](#7-subir-el-código-a-github)
8. [Desplegar en Render](#8-desplegar-en-render)
9. [Últimos ajustes después del despliegue](#9-últimos-ajustes-después-del-despliegue)
10. [Pruebas para el informe](#10-pruebas-para-el-informe)
11. [Cómo funciona la seguridad (para explicarle al profe)](#11-cómo-funciona-la-seguridad-para-explicarle-al-profe)
12. [Problemas comunes](#12-problemas-comunes)

---

## 1. Qué incluye

**Mejoras del punto extra**

| Mejora | Dónde está |
|--------|-----------|
| Login con Firebase Authentication (correo/contraseña y Google) | `public/app.js` |
| Mensajes guardados en Firestore (y el historial se carga al entrar) | `server/firebase.js` |
| JWT: el ID Token de Firebase se cambia por un JWT propio, obligatorio para abrir el WebSocket | `server/auth.js`, `index.js` |
| Solo se aceptan conexiones desde los dominios de `ALLOWED_ORIGINS` | `index.js` |
| Variables de entorno leídas desde `.env` con `dotenv` | `server/config.js` |

**Requisitos de la Parte 5 (también cumplidos)**

- Mensajes en JSON con `usuario`, `texto`, `hora` (HH:mm) y `tipo` (`mensaje`, `aviso`, `escribiendo`).
- Recibidos a la izquierda con nombre, enviados a la derecha con hora (estilo WhatsApp).
- Tailwind CSS + paleta con variables CSS (`--color-fondo`, `--color-burbuja-enviada`, `--color-burbuja-recibida`, `--color-texto`, `--color-acento`…).
- Responsive desde 360 px de ancho.
- Modo claro/oscuro guardado en `localStorage`.
- Estado de conexión (verde = conectado, ámbar = reconectando, rojo = desconectado), avisos “X se unió / X salió”, contador de usuarios y “X está escribiendo…”.
- Rechazo de mensajes vacíos y de más de 200 caracteres, **en el cliente y en el servidor**.
- HTML, CSS y JS separados (`index.html`, `styles.css`, `app.js`) más el servidor.

---

## 2. Estructura del proyecto

```
├── index.js              ← Servidor: Express + WebSocket + validación de dominio y JWT
├── server/
│   ├── config.js         ← Lee y valida el .env
│   ├── firebase.js       ← Firebase Admin: verifica tokens y usa Firestore
│   ├── auth.js           ← Crea y verifica el JWT de sesión
│   └── chat.js           ← Lógica del chat (broadcast, avisos, escribiendo, validación)
├── public/
│   ├── index.html        ← Pantalla de login y de chat
│   ├── app.js            ← Lógica del navegador
│   └── styles.css        ← (se genera con `npm run build`, no se edita)
├── src/styles.css        ← Hoja de estilos propia con Tailwind + variables CSS
├── test/server.test.js   ← Pruebas automáticas (npm test)
├── firestore.rules       ← Reglas de seguridad para pegar en Firestore
├── render.yaml           ← Configuración opcional para Render
├── launcher/index.html   ← Página de entrada "Despertando el servidor…" (Firebase Hosting)
├── firebase.json         ← Configuración de Firebase Hosting (publica launcher/)
├── .firebaserc           ← Proyecto de Firebase usado por `firebase deploy`
├── .env.example          ← Plantilla de variables de entorno
└── .gitignore            ← Excluye node_modules y .env
```

---

## 3. Requisitos

- **Node.js 20 o superior** (`node -v` en la terminal).
- Una **cuenta de Google** (para Firebase).
- Una **cuenta de GitHub** (Render despliega desde GitHub).
- Una **cuenta de Render** → https://render.com (puedes entrar con GitHub). **No pide tarjeta.**

---

## 4. Configurar Firebase (paso a paso)

Todo se hace en la consola web: https://console.firebase.google.com
Todo esto entra en el **plan gratuito (Spark)**. No hace falta tarjeta.

### 4.1 Crear el proyecto

1. Clic en **Crear un proyecto** (o *Agregar proyecto*).
2. Ponle un nombre, por ejemplo `sala-fis-chat`, y continúa.
3. Cuando pregunte por **Google Analytics** puedes **desactivarlo** (no se necesita).
4. Clic en **Crear proyecto** y espera a que termine.

### 4.2 Activar Authentication

1. En el menú izquierdo: **Compilación / Build → Authentication → Comenzar**.
2. Pestaña **Método de acceso / Sign-in method**:
   - **Correo electrónico/contraseña** → activar el primer interruptor → **Guardar**.
   - **Google** → **Habilitar** → elige tu correo como *correo de asistencia* → **Guardar**.

### 4.3 Crear la base de datos Firestore

1. Menú izquierdo: **Compilación / Build → Firestore Database → Crear base de datos**.
2. Si pregunta por la edición, deja **Standard**.
3. **Ubicación**: elige una cercana, por ejemplo `southamerica-east1 (São Paulo)` o `nam5 (United States)`.
   ⚠️ No se puede cambiar después.
4. Elige **Iniciar en modo de producción** → **Crear**.
5. Ve a la pestaña **Reglas**, borra todo, pega el contenido del archivo [`firestore.rules`](firestore.rules)
   de este proyecto y clic en **Publicar**.

> Estas reglas bloquean el acceso directo desde el navegador. Solo el servidor (con su cuenta de servicio)
> puede leer y escribir mensajes. No hace falta crear la colección: se crea sola (`mensajes`) con el primer mensaje.

### 4.4 Registrar la app web (configuración pública)

1. Clic en el **engranaje ⚙️ → Configuración del proyecto**.
2. En la pestaña **General**, baja a **Tus apps** y clic en el ícono **`</>`** (Web).
3. Ponle un apodo (ej. `sala-fis-web`). **No** marques *Firebase Hosting*. Clic en **Registrar app**.
4. Verás un bloque como este. **Copia los valores**, los usarás en el `.env`:

   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",               // → FIREBASE_API_KEY
     authDomain: "sala-fis-chat.firebaseapp.com", // → FIREBASE_AUTH_DOMAIN
     projectId: "sala-fis-chat",        // → FIREBASE_PROJECT_ID
     storageBucket: "...",              // (no se usa)
     messagingSenderId: "...",          // (no se usa)
     appId: "1:1234:web:abcd..."        // → FIREBASE_APP_ID
   };
   ```

   > Estos valores **no son secretos**: Firebase los diseñó para ir en el navegador.
   > En este proyecto igual van en el `.env` y el servidor los entrega por `/api/config`.

### 4.5 Descargar la clave de la cuenta de servicio (SECRETA)

1. En **Configuración del proyecto**, pestaña **Cuentas de servicio / Service accounts**.
2. Clic en **Generar nueva clave privada → Generar clave**. Se descarga un archivo `.json`.
3. Ábrelo con VS Code. Necesitas dos campos:
   - `"client_email"` → `FIREBASE_CLIENT_EMAIL`
   - `"private_key"` → `FIREBASE_PRIVATE_KEY`

> 🔐 **Este archivo es una contraseña maestra de tu proyecto.** No lo subas a GitHub, no lo mandes por chat.
> Guárdalo **fuera** de la carpeta del proyecto (por si acaso, el `.gitignore` ya lo bloquea).

---

## 5. Crear tu archivo `.env`

1. En la carpeta del proyecto, copia `.env.example` y renombra la copia a **`.env`**.
   En PowerShell:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Genera un secreto para el JWT:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   Copia el resultado en `JWT_SECRET=`.
3. Llena los valores de Firebase (pasos 4.4 y 4.5). Ejemplo de cómo debe quedar:

   ```env
   PORT=3000
   TIMEZONE=America/Guayaquil
   ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
   JWT_SECRET=9f2c...(96 caracteres)...
   JWT_EXPIRES_IN=15m

   FIREBASE_API_KEY=AIzaSy...
   FIREBASE_AUTH_DOMAIN=sala-fis-chat.firebaseapp.com
   FIREBASE_PROJECT_ID=sala-fis-chat
   FIREBASE_APP_ID=1:1234567890:web:abcdef123456

   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-abc12@sala-fis-chat.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...muchas letras...\n-----END PRIVATE KEY-----\n"
   ```

   **Ojo con `FIREBASE_PRIVATE_KEY`:** copia el valor de `"private_key"` del JSON **tal cual, con las comillas
   dobles y los `\n`**. Todo va en **una sola línea**.

---

## 6. Probar en tu computadora

```powershell
npm install        # instala dependencias (solo la primera vez)
npm run dev        # compila el CSS y arranca el servidor (se reinicia solo al guardar)
```

> Si PowerShell no deja ejecutar `npm`, corre una vez:
> `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`

Deberías ver:

```
🚀 Servidor corriendo en http://localhost:3000
🔒 Orígenes permitidos: http://localhost:3000, http://127.0.0.1:3000
```

1. Abre **http://localhost:3000** en Chrome.
2. Pestaña **Crear cuenta** → pon tu nombre, un correo y una contraseña (mínimo 6 caracteres).
3. Abre **otra ventana de incógnito** (o Edge/Firefox) en la misma dirección y crea otra cuenta, o entra con Google.
4. Chatea entre las dos ventanas. Revisa en Firebase:
   - **Authentication → Users**: aparecen los usuarios registrados.
   - **Firestore Database → Datos**: aparece la colección `mensajes`.

**Pruebas automáticas** (no necesitan Firebase, lo simulan):

```powershell
npm test
```

Comandos disponibles:

| Comando | Para qué |
|---------|----------|
| `npm run dev` | Desarrollo (reinicio automático) |
| `npm start` | Producción |
| `npm run build` | Solo compila Tailwind → `public/styles.css` |
| `npm run watch:css` | Recompila el CSS al guardar (en otra terminal, si cambias estilos) |
| `npm test` | Pruebas automáticas del servidor |

---

## 7. Subir el código a GitHub

El proyecto ya está conectado a tu repo `WebSocket_Extra`. Antes de subir, **comprueba que `.env` NO aparezca**:

```powershell
git status
```

Si en la lista ves `.env` o un archivo `*firebase-adminsdk*.json`, **detente** (no deberían aparecer gracias al `.gitignore`).
Si todo está bien:

```powershell
git add .
git commit -m "Chat WebSocket con Firebase Auth, Firestore y JWT"
git push
```

> ¿El documento `LabWebAv05-WebSocket.docx` tiene tu nombre? Si el repo es público y no quieres que se vea,
> no lo agregues: usa `git add` solo con las carpetas y archivos del código.

---

## 8. Desplegar en Render

1. Entra a https://dashboard.render.com e inicia sesión con GitHub.
2. Clic en **+ New → Web Service**.
3. Conecta GitHub si te lo pide y elige el repositorio **WebSocket_Extra**.
4. Configura así:

   | Campo | Valor |
   |-------|-------|
   | **Name** | `sala-fis-chat` (de esto sale tu URL) |
   | **Language / Runtime** | `Node` |
   | **Branch** | `main` |
   | **Build Command** | `npm install && npm run build` |
   | **Start Command** | `node index.js` |
   | **Instance Type** | **Free** |

5. En **Environment Variables**, usa el botón **Add from .env** y pega el contenido de tu `.env`
   (o agrégalas una por una). Cambios importantes respecto a tu `.env` local:
   - **No** pongas `PORT` (Render pone el suyo).
   - En `ALLOWED_ORIGINS` pon por ahora `https://sala-fis-chat.onrender.com`
     (usa el nombre que elegiste; lo confirmas en el paso 9).
   - En `FIREBASE_PRIVATE_KEY` pega el valor igual que en el `.env` (con o sin comillas, ambos funcionan).
6. Clic en **Deploy Web Service** y espera a que el log diga `🚀 Servidor corriendo…` y el estado pase a **Live**.

> **Alternativa (Blueprint):** *New → Blueprint* y elige el repo. Render lee `render.yaml`, genera el
> `JWT_SECRET` solo y te pide llenar las demás variables.

> **Plan gratis:** si nadie entra en 15 minutos el servicio “se duerme”. La siguiente visita tarda unos
> 30–60 segundos en cargar. Es normal. Ábrelo un minuto antes de mostrarlo en clase.

---

## 9. Últimos ajustes después del despliegue

1. **Copia tu URL** de Render (arriba a la izquierda, ej. `https://sala-fis-chat.onrender.com`).
2. En Render → tu servicio → **Environment**: confirma que `ALLOWED_ORIGINS` sea **exactamente** esa URL
   (con `https://` y **sin** `/` al final). Si la cambias, Render redespliega solo.
   *Puedes poner varias separadas por coma*, ej.: `https://sala-fis-chat.onrender.com,http://localhost:3000`
3. En Firebase → **Authentication → Configuración / Settings → Dominios autorizados → Agregar dominio**
   y escribe `sala-fis-chat.onrender.com` (sin `https://`).
   Sin esto, el botón **Continuar con Google** falla con *unauthorized-domain*.
4. Abre tu URL y prueba. 🎉

---

## 9.1 (Opcional) Página de entrada en Firebase Hosting – "Despertando el servidor…"

Mientras Render está dormido, **tu código no corre**, así que la página del chat no puede mostrar nada
hasta que despierta. La solución es una pequeña página en **Firebase Hosting** (que nunca se duerme):
muestra “Despertando el servidor…” con un contador, consulta a Render cada pocos segundos y, cuando
responde, **te lleva al chat automáticamente**. Esa es la URL que compartes con tus compañeros o el profe.

> Dentro del chat también hay una ventana “El servidor se está iniciando” que aparece sola si se pierde
> la conexión más de 3 segundos (por ejemplo, si Render se reinicia). Esa no necesita configuración.

**Pasos (una sola vez):**

1. Abre `launcher/index.html` y cambia esta línea por tu URL de Render (sin `/` al final):
   ```js
   const RENDER_URL = 'https://sala-fis-chat.onrender.com';
   ```
2. Instala la herramienta de Firebase e inicia sesión con tu cuenta de Google:
   ```powershell
   npm install -g firebase-tools
   firebase login
   ```
3. Desde la carpeta del proyecto, publica la página:
   ```powershell
   firebase deploy --only hosting
   ```
   Ya están listos `firebase.json` (publica la carpeta `launcher/`) y `.firebaserc` (tu proyecto
   `web-chat-57884`), así que **no** hace falta `firebase init`.
4. Al terminar te muestra la URL, por ejemplo **`https://web-chat-57884.web.app`**. Ábrela: verás la
   pantalla de espera y luego te lleva al chat.

> No hay que tocar `ALLOWED_ORIGINS`: la página de entrada solo consulta `/healthz` y después te
> redirige al chat en Render, así que el chat sigue funcionando desde el dominio de Render.

---

## 10. Pruebas para el informe

Capturas recomendadas para el PDF:

1. **Login** (pantalla de inicio de sesión) en modo claro y oscuro.
2. **Chat entre 2 usuarios** en dos navegadores distintos (o con un compañero desde otro computador/IP).
3. **Celular**: abre la URL de Render en tu teléfono.
4. **Firebase → Authentication → Users** con los usuarios registrados.
5. **Firebase → Firestore → mensajes** con los mensajes guardados.
6. **Historial**: recarga la página y muestra que los mensajes siguen ahí.
7. **Validación de JWT**: en la consola del navegador (F12) ejecuta
   ```js
   new WebSocket(location.origin.replace('http', 'ws') + '/?token=falso')
   ```
   → falla, y el log de Render muestra `⛔ JWT inválido en WebSocket`.
8. **Validación de dominio**: abre cualquier otra página (ej. `https://example.com`), F12 → consola, y ejecuta
   ```js
   new WebSocket('wss://sala-fis-chat.onrender.com/?token=x')
   ```
   → el log de Render muestra `⛔ Conexión WebSocket rechazada desde origen: https://example.com`.
9. **Validaciones**: intenta enviar un mensaje de más de 200 caracteres y mira el aviso en rojo.
10. **DevTools → Network → WS**: la conexión WebSocket con los mensajes JSON (`usuario`, `texto`, `hora`, `tipo`).

---

## 11. Cómo funciona la seguridad (para explicarle al profe)

```
1. Navegador ──(correo+clave / Google)──► Firebase Auth ──► ID Token (JWT firmado por Google)
2. Navegador ──POST /api/session + "Authorization: Bearer <ID Token>"──► Servidor
      Servidor: comprueba Origin ✔ → verifica el ID Token con firebase-admin ✔
                → firma un JWT propio (HS256, JWT_SECRET, expira en 15 min)
3. Navegador ──WebSocket  wss://.../?token=<JWT propio>──► Servidor
      Servidor (en el "upgrade", antes de aceptar): Origin permitido ✔ y JWT válido ✔
      Si algo falla → responde 403/401 y la conexión nunca se abre.
4. Cada mensaje: el servidor usa el nombre del JWT (no el que mande el cliente),
   valida el texto (vacío / >200), lo difunde a todos y lo guarda en Firestore.
```

- **Nada secreto en el código**: todo sale del `.env` (local) o de las variables de entorno (Render).
- **Firestore cerrado** al navegador (reglas `allow read, write: if false`). Solo el servidor accede.
- **Sin XSS**: los mensajes se pintan con `textContent`, nunca con `innerHTML`.
- **Anti-spam** simple: máximo 10 mensajes cada 10 segundos por conexión.
- **Reconexión**: si se cae la conexión, el cliente pide un JWT nuevo y reintenta (1 s, 2 s, 4 s… hasta 10 s).

---

## 12. Problemas comunes

| Síntoma | Causa / Solución |
|---------|------------------|
| `❌ Faltan variables de entorno: ...` al arrancar | No existe `.env` o falta alguna variable. Revisa el paso 5. En Render, revisa *Environment*. |
| `Failed to parse private key` / `Invalid PEM` | `FIREBASE_PRIVATE_KEY` mal copiada. Debe ir en una sola línea, con los `\n` y empezar con `-----BEGIN PRIVATE KEY-----`. |
| Se queda en **Reconectando…** y en el log sale `⛔ Conexión WebSocket rechazada desde origen` | El dominio no está en `ALLOWED_ORIGINS`. Pon exactamente la URL que ves en el navegador (con `https://`, sin `/` final). |
| “Este dominio no está autorizado en Firebase Authentication” | Agrega el dominio en Firebase → Authentication → Settings → Dominios autorizados (paso 9.3). |
| “Este método de acceso no está activado” | Activa *Correo/contraseña* o *Google* en Authentication → Sign-in method (paso 4.2). |
| Los mensajes no se guardan; el log dice `Error guardando en Firestore: ... NOT_FOUND` | No creaste la base de Firestore (paso 4.3) o `FIREBASE_PROJECT_ID` está mal. |
| `16 UNAUTHENTICATED: Request had invalid authentication credentials` | `FIREBASE_CLIENT_EMAIL` o `FIREBASE_PRIVATE_KEY` mal copiados: copia **solo el valor**, sin la coma del JSON. Deben ser del mismo archivo JSON. |
| `PERMISSION_DENIED` en Firestore | La cuenta de servicio es de **otro** proyecto. Descarga la clave del mismo proyecto. |
| La página tarda mucho en abrir en Render | El plan gratis estaba dormido. Espera ~1 minuto, o usa la página de entrada (sección 9.1). |
| La página de entrada se queda en “Despertando…” para siempre | `RENDER_URL` en `launcher/index.html` está mal escrita, o el servicio está suspendido en Render. Abre `TU_URL/healthz`: debe mostrar `{"ok":true}`. |
| `firebase` no se reconoce como comando | Cierra y vuelve a abrir la terminal después de `npm install -g firebase-tools`. |
| Los estilos no cargan (página sin diseño) | Falta compilar el CSS: `npm run build`. En Render, revisa que el Build Command incluya `npm run build`. |
| `npm` no funciona en PowerShell | `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` |

---

## Entregable

Para subir a la plataforma del curso, comprime la carpeta **sin `node_modules` y sin `.env`**:

```powershell
Compress-Archive -Path index.js,server,public,src,test,package.json,package-lock.json,firestore.rules,render.yaml,launcher,firebase.json,.firebaserc,.env.example,.gitignore,README.md,ROADMAP.md -DestinationPath LabWebAv05-WebSocket-Firebase.zip
```

(Incluye en el PDF del informe la URL de Render y las capturas del paso 10.)

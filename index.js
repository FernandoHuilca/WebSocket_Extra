// Servidor principal: Express (frontend + API) y WebSocket (chat en tiempo real)
const http = require('http');
const path = require('path');
const express = require('express');
const WebSocket = require('ws');
const config = require('./server/config');
const { signSessionToken, verifySessionToken, displayNameFrom } = require('./server/auth');
const { attachChat } = require('./server/chat');

// ¿El origen (dominio) de la petición está permitido?
function isAllowedOrigin(origin) {
  return Boolean(origin) && config.allowedOrigins.includes(config.normalizeOrigin(origin));
}

/**
 * Crea el servidor HTTP + WebSocket.
 * @param {object} deps  dependencias inyectables (Firebase), útiles para pruebas
 */
function createServer({ verifyFirebaseToken, store }) {
  const app = express();
  app.set('trust proxy', 1); // Render está detrás de un proxy
  app.disable('x-powered-by');

  // Cabeceras de seguridad básicas
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('X-Frame-Options', 'DENY');
    next();
  });

  app.use(express.json({ limit: '10kb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  // Comprobación de salud (Render la usa para saber si el servicio está vivo)
  // CORS abierto solo aquí: la página de entrada (Firebase Hosting) la consulta para saber si ya despertó
  app.get('/healthz', (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true });
  });

  // Configuración pública para el navegador (no contiene secretos)
  app.get('/api/config', (req, res) => {
    res.json({ firebase: config.firebaseWeb, maxLength: config.chat.maxLength });
  });

  // Intercambia el ID Token de Firebase (JWT) por el JWT de sesión del servidor
  app.post('/api/session', async (req, res) => {
    if (!isAllowedOrigin(req.get('origin'))) {
      return res.status(403).json({ error: 'Dominio no permitido.' });
    }
    const header = req.get('authorization') || '';
    const idToken = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!idToken) return res.status(401).json({ error: 'Falta el token de Firebase.' });

    try {
      const decoded = await verifyFirebaseToken(idToken);
      const name = displayNameFrom(decoded);
      const token = signSessionToken({ uid: decoded.uid, name });
      res.json({ token, usuario: name, maxLength: config.chat.maxLength });
    } catch (err) {
      console.warn('Token de Firebase rechazado:', err.code || err.message);
      res.status(401).json({ error: 'Sesión inválida. Vuelve a iniciar sesión.' });
    }
  });

  const server = http.createServer(app);

  // WebSocket sin servidor propio: la autenticación se hace en el "upgrade"
  const wss = new WebSocket.Server({ noServer: true, maxPayload: 4 * 1024 });

  // Rechaza la conexión antes de abrir el WebSocket
  function reject(socket, status, reason) {
    socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  }

  server.on('upgrade', (req, socket, head) => {
    // 1) Solo clientes del dominio permitido
    const origin = req.headers.origin;
    if (!isAllowedOrigin(origin)) {
      console.warn(`⛔ Conexión WebSocket rechazada desde origen: ${origin || '(sin origen)'}`);
      return reject(socket, 403, 'Forbidden');
    }

    // 2) JWT de sesión obligatorio (?token=...)
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    try {
      req.user = verifySessionToken(token || '');
    } catch (err) {
      console.warn('⛔ JWT inválido en WebSocket:', err.message);
      return reject(socket, 401, 'Unauthorized');
    }

    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  attachChat(wss, {
    store,
    timezone: config.timezone,
    maxLength: config.chat.maxLength,
    historyLimit: config.chat.historyLimit,
  });

  server.on('close', () => wss.close());
  return server;
}

// Arranque normal (npm start / npm run dev)
if (require.main === module) {
  const firebase = require('./server/firebase');
  const server = createServer({
    verifyFirebaseToken: firebase.verifyFirebaseToken,
    store: firebase,
  });
  server.listen(config.port, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${config.port}`);
    console.log(`🔒 Orígenes permitidos: ${config.allowedOrigins.join(', ')}`);
  });
}

module.exports = { createServer };

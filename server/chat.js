// Lógica del chat: difusión (broadcast), avisos, "escribiendo…", contador de
// usuarios, validaciones del lado del servidor y guardado en Firestore.
const WebSocket = require('ws');

// Formatea la hora como HH:mm en la zona horaria configurada
function formatHour(date, timezone) {
  return new Intl.DateTimeFormat('es-EC', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(date);
}

// Valida el texto de un mensaje (misma regla que en el cliente)
function validateText(text, maxLength) {
  if (typeof text !== 'string') return { ok: false, error: 'El mensaje no es válido.' };
  const texto = text.trim();
  if (texto.length === 0) return { ok: false, error: 'No puedes enviar un mensaje vacío.' };
  if (texto.length > maxLength) {
    return { ok: false, error: `El mensaje supera los ${maxLength} caracteres.` };
  }
  return { ok: true, texto };
}

/**
 * Conecta la lógica del chat a un servidor WebSocket.
 * @param {WebSocket.Server} wss
 * @param {object} opts
 * @param {{saveMessage: Function, getRecentMessages: Function}} opts.store  persistencia (Firestore)
 */
function attachChat(wss, { store, timezone, maxLength, historyLimit }) {
  // uid -> número de pestañas abiertas (un usuario cuenta una sola vez)
  const online = new Map();
  const now = () => formatHour(new Date(), timezone);

  // Envía un objeto JSON a todos (o a todos menos uno)
  function broadcast(obj, except) {
    const data = JSON.stringify(obj);
    wss.clients.forEach((client) => {
      if (client !== except && client.readyState === WebSocket.OPEN) client.send(data);
    });
  }

  function send(ws, obj) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  function notice(texto) {
    broadcast({ tipo: 'aviso', usuario: 'Sistema', texto, hora: now(), conectados: online.size });
  }

  wss.on('connection', async (ws, req) => {
    // El usuario ya fue autenticado con JWT en el "upgrade" (ver index.js)
    const user = req.user;
    ws.user = user;
    ws.isAlive = true;
    ws.rate = { count: 0, since: Date.now() };

    const tabs = (online.get(user.uid) || 0) + 1;
    online.set(user.uid, tabs);
    console.log(`🟢 ${user.name} conectado. Usuarios: ${online.size}`);

    // Historial guardado en Firestore para el nuevo cliente
    let mensajes = [];
    try {
      mensajes = await store.getRecentMessages(historyLimit);
    } catch (err) {
      console.error('Error leyendo historial de Firestore:', err.message);
    }
    send(ws, { tipo: 'historial', mensajes, conectados: online.size, yo: { uid: user.uid, usuario: user.name } });

    // Aviso "X se unió" solo cuando abre su primera pestaña
    if (tabs === 1) notice(`${user.name} se unió al chat`);
    else send(ws, { tipo: 'aviso', usuario: 'Sistema', texto: 'Sesión abierta en otra pestaña', hora: now(), conectados: online.size });

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (raw) => {
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return send(ws, { tipo: 'error', texto: 'Formato inválido: se esperaba JSON.' });
      }

      if (data.tipo === 'escribiendo') {
        // Se reenvía a los demás; el nombre sale del JWT, no del cliente
        return broadcast({ tipo: 'escribiendo', uid: user.uid, usuario: user.name, hora: now() }, ws);
      }

      if (data.tipo !== 'mensaje') {
        return send(ws, { tipo: 'error', texto: 'Tipo de mensaje desconocido.' });
      }

      // Límite simple anti-spam: 10 mensajes cada 10 segundos
      const t = Date.now();
      if (t - ws.rate.since > 10000) ws.rate = { count: 0, since: t };
      if (++ws.rate.count > 10) {
        return send(ws, { tipo: 'error', texto: 'Vas muy rápido. Espera unos segundos.' });
      }

      // Validación en el servidor
      const result = validateText(data.texto, maxLength);
      if (!result.ok) return send(ws, { tipo: 'error', texto: result.error });

      const msg = { tipo: 'mensaje', uid: user.uid, usuario: user.name, texto: result.texto, hora: now() };
      broadcast(msg);

      try {
        await store.saveMessage(msg);
      } catch (err) {
        console.error('Error guardando en Firestore:', err.message);
      }
    });

    ws.on('close', () => {
      const left = (online.get(user.uid) || 1) - 1;
      if (left <= 0) {
        online.delete(user.uid);
        notice(`${user.name} salió del chat`);
      } else {
        online.set(user.uid, left);
      }
      console.log(`🔴 ${user.name} desconectado. Usuarios: ${online.size}`);
    });

    ws.on('error', (err) => console.error('Error WebSocket:', err.message));
  });

  // Latido (ping) cada 30 s: cierra conexiones muertas y evita que el proxy las corte
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);
  wss.on('close', () => clearInterval(heartbeat));
}

module.exports = { attachChat, validateText, formatHour };

// JWT propio del servidor: se emite tras verificar el ID Token de Firebase
// y se exige para abrir la conexión WebSocket.
const jwt = require('jsonwebtoken');
const config = require('./config');

const ISSUER = 'websocket-chat';
const AUDIENCE = 'websocket-chat-ws';

// Crea un JWT de sesión con los datos mínimos del usuario
function signSessionToken({ uid, name }) {
  return jwt.sign({ name }, config.jwt.secret, {
    subject: uid,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: config.jwt.expiresIn,
    algorithm: 'HS256',
  });
}

// Verifica el JWT de sesión; lanza error si es inválido o expiró
function verifySessionToken(token) {
  const payload = jwt.verify(token, config.jwt.secret, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ['HS256'],
  });
  return { uid: payload.sub, name: payload.name };
}

// Nombre visible: displayName de Firebase o la parte local del correo
function displayNameFrom(decoded) {
  const raw = decoded.name || (decoded.email ? decoded.email.split('@')[0] : 'Anónimo');
  return String(raw).trim().slice(0, 30) || 'Anónimo';
}

module.exports = { signSessionToken, verifySessionToken, displayNameFrom };

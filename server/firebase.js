// Inicializa Firebase Admin: verifica ID Tokens y accede a Firestore
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const config = require('./config');

const app = initializeApp({ credential: cert(config.firebaseAdmin) });
const auth = getAuth(app);
const db = getFirestore(app);
const messages = db.collection('mensajes');

// Verifica el ID Token (JWT) emitido por Firebase Authentication
async function verifyFirebaseToken(idToken) {
  return auth.verifyIdToken(idToken);
}

// Guarda un mensaje del chat en Firestore
async function saveMessage(msg) {
  await messages.add({
    uid: msg.uid,
    usuario: msg.usuario,
    texto: msg.texto,
    hora: msg.hora,
    tipo: msg.tipo,
    creadoEn: FieldValue.serverTimestamp(),
  });
}

// Devuelve los últimos N mensajes en orden cronológico
async function getRecentMessages(limit) {
  const snap = await messages.orderBy('creadoEn', 'desc').limit(limit).get();
  return snap.docs
    .map((doc) => {
      const d = doc.data();
      return { uid: d.uid, usuario: d.usuario, texto: d.texto, hora: d.hora, tipo: 'mensaje' };
    })
    .reverse();
}

module.exports = { verifyFirebaseToken, saveMessage, getRecentMessages };

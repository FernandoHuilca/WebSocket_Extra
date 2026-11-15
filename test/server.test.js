// Pruebas del servidor sin Firebase real (se simulan Auth y Firestore).
// Ejecutar con: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

// Variables de entorno ficticias para las pruebas
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
Object.assign(process.env, {
  PORT: '0',
  ALLOWED_ORIGINS: 'http://permitido.test',
  JWT_SECRET: 'x'.repeat(48),
  FIREBASE_API_KEY: 'k', FIREBASE_AUTH_DOMAIN: 'd', FIREBASE_PROJECT_ID: 'p', FIREBASE_APP_ID: 'a',
  FIREBASE_CLIENT_EMAIL: 'e@p.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
});

const WebSocket = require('ws');
const { createServer } = require('../index');
const { validateText } = require('../server/chat');

const ORIGIN = 'http://permitido.test';
const saved = [];
const fakeStore = {
  saveMessage: async (m) => { saved.push(m); },
  getRecentMessages: async () => saved.slice(-50),
};
// Simula Firebase: "valido-ana" y "valido-luis" son tokens correctos
const fakeVerify = async (t) => {
  if (t === 'valido-ana') return { uid: 'u1', name: 'Ana' };
  if (t === 'valido-luis') return { uid: 'u2', email: 'luis@epn.edu.ec' };
  throw Object.assign(new Error('bad'), { code: 'auth/argument-error' });
};

let server, base;
before(async () => {
  server = createServer({ verifyFirebaseToken: fakeVerify, store: fakeStore });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const session = (idToken, origin = ORIGIN) =>
  fetch(`${base}/api/session`, { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, Origin: origin } });

// Abre un WebSocket y guarda los mensajes recibidos
function open(token, origin = ORIGIN) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/?token=${token}`, { origin });
    ws.inbox = [];
    ws.on('message', (d) => ws.inbox.push(JSON.parse(d)));
    ws.on('open', () => resolve(ws));
    ws.on('unexpected-response', (req, res) => reject(new Error(String(res.statusCode))));
    ws.on('error', reject);
  });
}
const waitFor = async (ws, pred, ms = 2000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const m = ws.inbox.find(pred);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('Tiempo de espera agotado');
};

test('validación de texto (vacío, espacios, >200)', () => {
  assert.equal(validateText('', 200).ok, false);
  assert.equal(validateText('    ', 200).ok, false);
  assert.equal(validateText('a'.repeat(201), 200).ok, false);
  assert.deepEqual(validateText('  hola  ', 200), { ok: true, texto: 'hola' });
});

test('/api/config no expone secretos', async () => {
  const body = await (await fetch(`${base}/api/config`)).json();
  assert.equal(body.firebase.apiKey, 'k');
  assert.ok(!JSON.stringify(body).includes('PRIVATE KEY'));
});

test('/api/session rechaza dominio no permitido y token inválido', async () => {
  assert.equal((await session('valido-ana', 'http://malo.test')).status, 403);
  assert.equal((await session('falso')).status, 401);
});

test('WebSocket rechaza origen no permitido y JWT inválido', async () => {
  const { token } = await (await session('valido-ana')).json();
  await assert.rejects(open(token, 'http://malo.test'), /403/);
  await assert.rejects(open('jwt-falso'), /401/);
});

test('flujo completo: avisos, contador, escribiendo, mensajes, validación y guardado', async () => {
  const ana = await open((await (await session('valido-ana')).json()).token);
  const h = await waitFor(ana, (m) => m.tipo === 'historial');
  assert.equal(h.yo.usuario, 'Ana');

  const luis = await open((await (await session('valido-luis')).json()).token);
  const aviso = await waitFor(ana, (m) => m.tipo === 'aviso' && m.texto.includes('luis se unió'));
  assert.equal(aviso.conectados, 2);
  assert.match(aviso.hora, /^\d{2}:\d{2}$/);

  luis.send(JSON.stringify({ tipo: 'escribiendo' }));
  await waitFor(ana, (m) => m.tipo === 'escribiendo' && m.usuario === 'luis');

  // El servidor ignora el "usuario" enviado por el cliente y usa el del JWT
  ana.send(JSON.stringify({ tipo: 'mensaje', usuario: 'Impostor', texto: '  Hola Luis  ', hora: '00:00' }));
  const m = await waitFor(luis, (x) => x.tipo === 'mensaje');
  assert.deepEqual([m.usuario, m.texto, m.uid], ['Ana', 'Hola Luis', 'u1']);
  assert.match(m.hora, /^\d{2}:\d{2}$/);

  ana.send(JSON.stringify({ tipo: 'mensaje', texto: 'x'.repeat(201) }));
  await waitFor(ana, (x) => x.tipo === 'error' && x.texto.includes('200'));
  ana.send(JSON.stringify({ tipo: 'mensaje', texto: '   ' }));
  await waitFor(ana, (x) => x.tipo === 'error' && x.texto.includes('vacío'));

  assert.equal(saved.length, 1);
  assert.equal(saved[0].texto, 'Hola Luis');

  luis.close();
  await waitFor(ana, (x) => x.tipo === 'aviso' && x.texto.includes('luis salió') && x.conectados === 1);
  ana.close();
});

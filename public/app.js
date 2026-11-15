// Cliente del chat: Firebase Authentication + WebSocket + interfaz
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';

// ---------- Referencias del DOM ----------
const $ = (id) => document.getElementById(id);
const views = { loading: $('loadingView'), login: $('loginView'), chat: $('chatView') };
const ui = {
  themeBtn: $('themeBtn'),
  tabLogin: $('tabLogin'), tabRegister: $('tabRegister'),
  authForm: $('authForm'), nameField: $('nameField'), nameInput: $('nameInput'),
  emailInput: $('emailInput'), passwordInput: $('passwordInput'),
  authError: $('authError'), authSubmit: $('authSubmit'), googleBtn: $('googleBtn'),
  status: $('status'), statusText: $('statusText'), usersCount: $('usersCount'),
  meName: $('meName'), logoutBtn: $('logoutBtn'),
  messages: $('messages'), emptyState: $('emptyState'), typing: $('typing'),
  messageForm: $('messageForm'), messageInput: $('messageInput'),
  sendBtn: $('sendBtn'), charCount: $('charCount'), composerError: $('composerError'),
};

// ---------- Estado ----------
let auth;
let ws = null;
let me = null;               // { uid, usuario }
let maxLength = 200;
let mode = 'login';          // 'login' | 'register'
let registering = false;     // evita conectar antes de guardar el nombre
let manualClose = false;     // true cuando el usuario cierra sesión
let chatStarted = false;
let retryDelay = 1000;
let retryTimer = null;
let lastTypingSent = 0;
const typingUsers = new Map(); // uid -> { usuario, timer }

// ---------- Utilidades ----------
const show = (name) => Object.entries(views).forEach(([k, el]) => { el.hidden = k !== name; });

function nowHHmm() {
  return new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Misma validación que el servidor
function validateText(text) {
  const texto = text.trim();
  if (!texto) return { ok: false, error: 'No puedes enviar un mensaje vacío.' };
  if (texto.length > maxLength) return { ok: false, error: `Tu mensaje tiene ${texto.length} caracteres. El máximo es ${maxLength}.` };
  return { ok: true, texto };
}

let errorTimer;
function showComposerError(text) {
  ui.composerError.textContent = text;
  ui.composerError.hidden = false;
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => { ui.composerError.hidden = true; }, 4000);
}

// ---------- Modo claro / oscuro ----------
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  ui.themeBtn.setAttribute('aria-label', theme === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
  try { localStorage.setItem('chat-tema', theme); } catch { /* almacenamiento bloqueado */ }
}
ui.themeBtn.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'oscuro' ? 'claro' : 'oscuro');
});
applyTheme(document.documentElement.dataset.theme || 'claro');

// ---------- Login / Registro ----------
function setMode(next) {
  mode = next;
  const isRegister = mode === 'register';
  ui.tabLogin.setAttribute('aria-selected', String(!isRegister));
  ui.tabRegister.setAttribute('aria-selected', String(isRegister));
  ui.nameField.hidden = !isRegister;
  ui.passwordInput.autocomplete = isRegister ? 'new-password' : 'current-password';
  ui.authSubmit.textContent = isRegister ? 'Crear cuenta' : 'Iniciar sesión';
  ui.authError.hidden = true;
}
ui.tabLogin.addEventListener('click', () => setMode('login'));
ui.tabRegister.addEventListener('click', () => setMode('register'));

// Traduce los códigos de error de Firebase a mensajes claros
function authMessage(err) {
  const map = {
    'auth/invalid-email': 'El correo no tiene un formato válido.',
    'auth/missing-password': 'Escribe tu contraseña.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/wrong-password': 'Correo o contraseña incorrectos.',
    'auth/user-not-found': 'No existe una cuenta con ese correo.',
    'auth/email-already-in-use': 'Ya existe una cuenta con ese correo. Inicia sesión.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/too-many-requests': 'Demasiados intentos. Espera un momento e inténtalo otra vez.',
    'auth/popup-closed-by-user': 'Cerraste la ventana de Google antes de terminar.',
    'auth/unauthorized-domain': 'Este dominio no está autorizado en Firebase Authentication (ver README).',
    'auth/operation-not-allowed': 'Este método de acceso no está activado en Firebase (ver README).',
    'auth/network-request-failed': 'Sin conexión a internet.',
  };
  return map[err.code] || err.message || 'No se pudo iniciar sesión.';
}

function showAuthError(text) {
  ui.authError.textContent = text;
  ui.authError.hidden = false;
}

ui.authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = ui.emailInput.value.trim();
  const password = ui.passwordInput.value;
  const name = ui.nameInput.value.trim();

  if (mode === 'register' && !name) return showAuthError('Escribe tu nombre: es el que verán los demás.');
  if (!email || !password) return showAuthError('Completa correo y contraseña.');

  ui.authSubmit.disabled = true;
  try {
    if (mode === 'register') {
      registering = true;
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      await cred.user.getIdToken(true); // refresca el token para que incluya el nombre
      registering = false;
      startChat(cred.user);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (err) {
    registering = false;
    showAuthError(authMessage(err));
  } finally {
    ui.authSubmit.disabled = false;
  }
});

ui.googleBtn.addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    showAuthError(authMessage(err));
  }
});

ui.logoutBtn.addEventListener('click', async () => {
  manualClose = true;
  clearTimeout(retryTimer);
  if (ws) ws.close(1000, 'logout');
  await signOut(auth);
});

// ---------- Conexión WebSocket ----------
function setStatus(state) {
  const labels = { conectado: 'Conectado', desconectado: 'Desconectado', reconectando: 'Reconectando…' };
  ui.status.dataset.state = state;
  ui.statusText.textContent = labels[state];
  const online = state === 'conectado';
  ui.messageInput.disabled = !online;
  updateComposer();
  if (state === 'reconectando') showWake(); else hideWake();
}

// ---------- Ventana "El servidor se está iniciando" ----------
// Render (plan gratis) se duerme tras 15 min sin uso y tarda ~1 min en despertar.
// Se muestra solo si la reconexión tarda más de 3 s, para no parpadear en cortes breves.
const wake = { el: $('wakeOverlay'), seconds: $('wakeSeconds'), delay: null, tick: null, start: 0 };

const wakeDefaults = { title: $('wakeTitle').textContent, text: $('wakeText').textContent };

function showWake() {
  if (wake.delay || !wake.el.hidden) return;
  wake.delay = setTimeout(() => {
    // Restaura el texto normal por si antes se mostró un error
    delete wake.el.dataset.error;
    $('wakeTitle').textContent = wakeDefaults.title;
    $('wakeText').textContent = wakeDefaults.text;
    wake.start = Date.now();
    wake.seconds.textContent = '0';
    wake.el.hidden = false;
    wake.tick = setInterval(() => {
      wake.seconds.textContent = String(Math.round((Date.now() - wake.start) / 1000));
    }, 1000);
  }, 3000);
}

function hideWake() {
  clearTimeout(wake.delay);
  clearInterval(wake.tick);
  wake.delay = wake.tick = null;
  wake.el.hidden = true;
}

// Misma ventana, pero para errores que no se arreglan esperando (sin spinner ni contador)
function showWakeError(title, text) {
  hideWake();
  $('wakeTitle').textContent = title;
  $('wakeText').textContent = text;
  wake.el.dataset.error = 'true';
  wake.el.hidden = false;
  ui.statusText.textContent = 'Desconectado';
  ui.status.dataset.state = 'desconectado';
}

// Pide al servidor un JWT de sesión a cambio del ID Token de Firebase
async function getSessionToken(user) {
  const idToken = await user.getIdToken();
  const res = await fetch('/api/session', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || 'No se pudo abrir la sesión.');
    err.status = res.status;
    throw err;
  }
  return body;
}

async function connect(user) {
  clearTimeout(retryTimer);
  let session;
  try {
    session = await getSessionToken(user);
  } catch (err) {
    if (err.status === 401) { await signOut(auth); return; }
    // 403 = el servidor no permite este dominio: es un error de configuración, no hay que esperar
    if (err.status === 403) {
      showWakeError(
        'Este dominio no está permitido',
        `El servidor rechazó la conexión desde ${location.origin}. Agrega exactamente esa dirección a ALLOWED_ORIGINS en las variables de entorno (Render o .env) y vuelve a cargar la página.`
      );
      return;
    }
    return scheduleReconnect(user);
  }
  if (manualClose) return; // cerró sesión mientras esperaba
  maxLength = session.maxLength || maxLength;
  updateComposer();

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/?token=${encodeURIComponent(session.token)}`);

  ws.onopen = () => {
    retryDelay = 1000;
    setStatus('conectado');
  };

  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    handleServerMessage(msg);
  };

  ws.onclose = () => {
    ws = null;
    if (manualClose) { setStatus('desconectado'); return; }
    scheduleReconnect(user);
  };

  ws.onerror = () => { /* el evento close se encarga de reconectar */ };
}

// Reintento con espera creciente (1s, 2s, 4s… hasta 10s)
function scheduleReconnect(user) {
  setStatus('reconectando');
  retryTimer = setTimeout(() => connect(user), retryDelay);
  retryDelay = Math.min(retryDelay * 2, 10000);
}

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

// ---------- Mensajes del servidor ----------
function handleServerMessage(msg) {
  switch (msg.tipo) {
    case 'historial':
      me = msg.yo;
      ui.meName.textContent = me.usuario;
      ui.messages.querySelectorAll('.msg, .notice').forEach((el) => el.remove());
      msg.mensajes.forEach(renderMessage);
      updateUsers(msg.conectados);
      scrollToBottom();
      break;
    case 'mensaje':
      clearTyping(msg.uid);
      renderMessage(msg);
      scrollToBottom();
      break;
    case 'aviso':
      renderNotice(msg.texto);
      if (typeof msg.conectados === 'number') updateUsers(msg.conectados);
      scrollToBottom();
      break;
    case 'escribiendo':
      showTyping(msg.uid, msg.usuario);
      break;
    case 'error':
      showComposerError(msg.texto);
      break;
  }
}

// Burbuja: enviados a la derecha (con hora), recibidos a la izquierda (con nombre y hora)
function renderMessage(msg) {
  ui.emptyState.hidden = true;
  const mine = me && msg.uid === me.uid;
  const bubble = document.createElement('article');
  bubble.className = `msg ${mine ? 'msg-out' : 'msg-in'}`;

  if (!mine) {
    const author = document.createElement('span');
    author.className = 'msg-author';
    author.textContent = msg.usuario; // textContent evita inyección de HTML (XSS)
    bubble.append(author);
  }
  const time = document.createElement('time');
  time.className = 'msg-time';
  time.textContent = msg.hora;
  const text = document.createElement('span');
  text.className = 'msg-text';
  text.textContent = msg.texto;

  bubble.append(time, text);
  ui.messages.append(bubble);
}

function renderNotice(texto) {
  const p = document.createElement('p');
  p.className = 'notice';
  p.textContent = texto;
  ui.messages.append(p);
}

function updateUsers(n) {
  ui.usersCount.textContent = n === 1 ? '1 conectado' : `${n} conectados`;
}

function scrollToBottom() {
  ui.messages.scrollTop = ui.messages.scrollHeight;
}

// ---------- "X está escribiendo…" ----------
function showTyping(uid, usuario) {
  const current = typingUsers.get(uid);
  if (current) clearTimeout(current.timer);
  // Desaparece tras 3 segundos sin actividad
  const timer = setTimeout(() => clearTyping(uid), 3000);
  typingUsers.set(uid, { usuario, timer });
  renderTyping();
}

function clearTyping(uid) {
  const current = typingUsers.get(uid);
  if (!current) return;
  clearTimeout(current.timer);
  typingUsers.delete(uid);
  renderTyping();
}

function renderTyping() {
  const names = [...typingUsers.values()].map((t) => t.usuario);
  if (names.length === 0) ui.typing.textContent = '';
  else if (names.length === 1) ui.typing.textContent = `${names[0]} está escribiendo…`;
  else ui.typing.textContent = `${names.slice(0, -1).join(', ')} y ${names.at(-1)} están escribiendo…`;
}

// ---------- Caja de mensaje ----------
function updateComposer() {
  const len = ui.messageInput.value.trim().length;
  ui.charCount.textContent = `${len}/${maxLength}`;
  ui.charCount.classList.toggle('over', len > maxLength);
  ui.sendBtn.disabled = ui.messageInput.disabled || len === 0;
}

ui.messageInput.addEventListener('input', () => {
  updateComposer();
  // Avisa "escribiendo" como máximo cada 1.5 s
  const t = Date.now();
  if (ui.messageInput.value.trim() && t - lastTypingSent > 1500) {
    lastTypingSent = t;
    send({ tipo: 'escribiendo', usuario: me?.usuario, texto: '', hora: nowHHmm() });
  }
});

ui.messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const result = validateText(ui.messageInput.value);
  if (!result.ok) {
    showComposerError(result.error);
    return;
  }
  // Objeto JSON con los campos usuario, texto, hora y tipo
  send({ tipo: 'mensaje', usuario: me?.usuario, texto: result.texto, hora: nowHHmm() });
  ui.messageInput.value = '';
  lastTypingSent = 0;
  updateComposer();
  ui.messageInput.focus();
});

// ---------- Inicio ----------
function startChat(user) {
  if (chatStarted) return;
  chatStarted = true;
  manualClose = false;
  show('chat');
  setStatus('reconectando');
  ui.statusText.textContent = 'Conectando…';
  connect(user).then(() => ui.messageInput.focus());
}

async function init() {
  // Si el servidor aún no responde (se está iniciando), reintenta mostrando la ventana
  let cfg;
  while (!cfg) {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error(res.status);
      cfg = await res.json();
    } catch {
      showWake();
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  hideWake();
  maxLength = cfg.maxLength || maxLength;
  auth = getAuth(initializeApp(cfg.firebase));

  onAuthStateChanged(auth, (user) => {
    if (user && !registering) {
      startChat(user);
    } else if (!user) {
      me = null;
      chatStarted = false;
      typingUsers.clear();
      renderTyping();
      show('login');
      ui.emailInput.focus();
    }
  });
}

init();

// Lee y valida las variables de entorno desde el archivo .env
require('dotenv').config({ quiet: true });

const REQUIRED = [
  'JWT_SECRET',
  'ALLOWED_ORIGINS',
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_APP_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
];

// Limpia errores típicos al copiar desde el JSON de Firebase:
// espacios, coma final y comillas alrededor ("valor",  →  valor)
for (const name of REQUIRED) {
  const value = process.env[name];
  if (typeof value === 'string') {
    process.env[name] = value.trim().replace(/,\s*$/, '').replace(/^['"]|['"]$/g, '').trim();
  }
}

const missing = REQUIRED.filter((name) => !process.env[name] || !process.env[name].trim());
if (missing.length > 0) {
  console.error('❌ Faltan variables de entorno: ' + missing.join(', '));
  console.error('   Copia .env.example a .env y complétalo (ver README.md).');
  process.exit(1);
}

if (process.env.JWT_SECRET.length < 32) {
  console.warn('⚠️  JWT_SECRET es muy corto: usa al menos 32 caracteres aleatorios.');
}

// Normaliza un origen: sin espacios ni "/" final
const normalizeOrigin = (o) => o.trim().replace(/\/+$/, '').toLowerCase();

const config = {
  port: Number(process.env.PORT) || 3000,
  timezone: process.env.TIMEZONE || 'America/Guayaquil',
  allowedOrigins: process.env.ALLOWED_ORIGINS.split(',').map(normalizeOrigin).filter(Boolean),
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  },
  // Configuración pública de la app web (se entrega al navegador por /api/config)
  firebaseWeb: {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    appId: process.env.FIREBASE_APP_ID,
  },
  // Credenciales secretas de la cuenta de servicio (solo servidor)
  firebaseAdmin: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // En Render/.env los saltos de línea pueden llegar como "\n" literal
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  chat: {
    maxLength: 200,       // máximo de caracteres por mensaje
    historyLimit: 50,     // mensajes que se envían al conectarse
  },
};

config.normalizeOrigin = normalizeOrigin;
module.exports = config;

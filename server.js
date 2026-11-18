import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '.env');

if (existsSync(envPath)) {
  if (typeof process.loadEnvFile !== 'function') {
    throw new Error('Carregar .env requer Node.js 20.12 ou superior.');
  }
  process.loadEnvFile(envPath);
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.get('/site-config.js', (_req, res) => {
  const config = {
    firebase: {
      apiKey: process.env.FIREBASE_API_KEY || 'COLE_AQUI',
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'COLE_AQUI',
      projectId: process.env.FIREBASE_PROJECT_ID || 'COLE_AQUI',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'COLE_AQUI',
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || 'COLE_AQUI',
      appId: process.env.FIREBASE_APP_ID || 'COLE_AQUI',
      measurementId: process.env.FIREBASE_MEASUREMENT_ID || 'COLE_AQUI'
    },
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'COLE_AQUI',
      uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || 'COLE_AQUI'
    },
    whatsappNumber: '5521999999999',
    phoneDisplay: '(21) 99999-9999',
    instagramUrl: 'https://www.instagram.com/actionn.film/'
  };

  res.type('application/javascript').send(`window.ACTION_CONFIG = ${JSON.stringify(config)};`);
});

app.use((req, res, next) => {
  const blocked = ['/server.js', '/package.json', '/package-lock.json', '/metadata.json'];
  if (blocked.includes(req.path)) {
    return res.status(404).end();
  }
  next();
});

app.use(express.static(__dirname, { dotfiles: 'ignore' }));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ACTION Film Equipment server listening on http://0.0.0.0:${PORT}`);
});

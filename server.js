import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendPublicConfig } from './public-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const envPath = path.join(__dirname, '.env');

if (existsSync(envPath)) {
  if (typeof process.loadEnvFile !== 'function') {
    throw new Error('Carregar .env requer Node.js 20.12 ou superior.');
  }
  process.loadEnvFile(envPath);
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.get('/api/site-config.js', (_req, res) => sendPublicConfig(res));

app.use((req, res, next) => {
  const blocked = ['/server.js', '/package.json', '/package-lock.json', '/metadata.json'];
  if (blocked.includes(req.path)) {
    return res.status(404).end();
  }
  next();
});

app.use(express.static(publicDir, { dotfiles: 'ignore' }));

app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ACTION Film Equipment server listening on http://0.0.0.0:${PORT}`);
});

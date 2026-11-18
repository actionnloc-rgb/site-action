import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

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

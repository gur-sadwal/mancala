import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../util/logger.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, '..', '..');
export const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

export function erzeugeApp({ manager, lobby }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(sichereAntwort);
  app.get('/gesundheit', (req, res) => {
    res.json({
      status: 'ok',
      partien: manager.anzahl(),
      wartende: lobby.anzahl(),
      laufzeitSekunden: Math.round(process.uptime()),
    });
  });
  app.use(express.static(pfadZu('client'), { extensions: ['html'], maxAge: 0 }));
  app.use('/shared', express.static(pfadZu('shared'), { maxAge: 0 }));
  app.use(sende404);
  app.use(meldeHttpFehler);
  return app;
}

function pfadZu(...teile) {
  return path.join(WURZEL, ...teile);
}

function sichereAntwort(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}

function sende404(req, res) {
  res.status(404).sendFile(pfadZu('client', '404.html'));
}

function meldeHttpFehler(fehler, req, res, next) {
  logger.error('HTTP-Fehler', fehler);
  if (res.headersSent) {
    next(fehler);
    return;
  }
  res.status(500).json({ fehler: 'Interner Serverfehler' });
}

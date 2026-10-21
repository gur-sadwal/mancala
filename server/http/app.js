/**
 * app.js – Browserdateien und Gesundheit über HTTP ausliefern.
 *
 * Liefert HTML, CSS und ES-Module direkt aus. Das gemeinsame Protokoll liegt
 * unter /shared; /gesundheit meldet laufende Partien und Wartende.
 *
 * Inhalt (Cmd+F nach „== 2.“):
 *   == 1. Pfade und Sicherheitsrichtlinie
 *   == 2. App zusammensetzen
 *   == 3. Pfade und Antworten
 *   == 4. Fehlerantwort
 *
 * Benutzt von: index.js. Benutzt Express, Pfade und Logger.
 */

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../util/logger.js';

// == 1. Pfade und Sicherheitsrichtlinie ==================================
const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, '..', '..');
// SCHUTZ: Skripte nur vom eigenen Server, keine Plugins oder Einbettung.
// data: erlaubt das leere Favicon. Inline-Skripte und eval bleiben verboten.
export const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

// == 2. App zusammensetzen ===============================================
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
  // Mit maxAge: 0 darf der Browser cachen, fragt aber vor jeder Nutzung nach.
  // So laufen nach einer Änderung keine alten Module weiter.
  app.use(express.static(pfadZu('client'), {
    extensions: ['html'],
    maxAge: 0,
  }));
  app.use('/shared', express.static(pfadZu('shared'), { maxAge: 0 }));
  app.use(sende404);
  app.use(meldeHttpFehler);
  return app;
}

// == 3. Pfade und Antworten ==============================================
function pfadZu(...teile) {
  return path.join(WURZEL, ...teile);
}

// SCHUTZ: nosniff sperrt Skripte und Styles mit unpassendem MIME-Typ
// (dem Dateityp aus der HTTP-Antwort). X-Frame-Options sperrt Einbettung
// auch in älteren Browsern, die frame-ancestors der CSP nicht kennen.
function sichereAntwort(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
}

function sende404(req, res) {
  res.status(404).sendFile(pfadZu('client', '404.html'));
}

// == 4. Fehlerantwort ====================================================
// ACHTUNG: Express erkennt den Fehlerbehandler an den vier Parametern.
function meldeHttpFehler(fehler, req, res, next) {
  logger.error('HTTP-Fehler', fehler);
  // Eine begonnene Antwort übernimmt Express; nicht noch einmal senden.
  if (res.headersSent) {
    next(fehler);
    return;
  }
  res.status(500).json({ fehler: 'Interner Serverfehler' });
}

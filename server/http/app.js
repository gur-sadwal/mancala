/**
 * Express-Anwendung: statische Auslieferung des Clients (Konzept 7.3).
 *
 * Keine Vorlagensprache, kein Buendler-Zwang: Die ES-Module werden direkt vom
 * Browser geladen (`<script type="module">`). Das haelt `npm run build`
 * schlank und macht im Review nachvollziehbar, dass genau der Code laeuft, der
 * im Repository steht.
 */

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { logger } from '../util/logger.js';

/** Wurzelverzeichnis des Projekts – zwei Ebenen ueber dieser Datei. */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, '..', '..');

/** Baut einen absoluten Pfad relativ zur Projektwurzel. */
const pfadZu = (...teile) => path.join(WURZEL, ...teile);

/**
 * @param {{manager: object, lobby: object}} deps  fuer den Gesundheitsendpunkt
 */
export function erzeugeApp({ manager, lobby }) {
  const app = express();

  // Verraet die Server-Technik nicht nach aussen.
  app.disable('x-powered-by');

  /**
   * Gesundheitsendpunkt (Konzept 7.10).
   *
   * Fuer den Spieletag wichtig: Mit einem Blick sehen, wie viele Partien
   * laufen, ohne die Protokollausgabe durchsuchen zu muessen.
   */
  app.get('/gesundheit', (req, res) => {
    res.json({
      status: 'ok',
      partien: manager.anzahl(),
      wartende: lobby.anzahl(),
      laufzeitSekunden: Math.round(process.uptime()),
    });
  });

  // Der Client. `maxAge: 0` verhindert, dass der Browser waehrend der
  // Entwicklung alte Dateien aus dem Zwischenspeicher zeigt.
  app.use(express.static(pfadZu('client'), { extensions: ['html'], maxAge: 0 }));

  // `shared/` wird von beiden Seiten benutzt: Der Server importiert die Datei,
  // der Browser laedt sie ueber diesen Pfad. Buchstaeblich dieselbe Datei –
  // der einfachste Weg, Tippfehler in Ereignisnamen auszuschliessen
  // (Konzept 12.3).
  app.use('/shared', express.static(pfadZu('shared'), { maxAge: 0 }));

  // Auffangregel fuer alles Uebrige.
  app.use((req, res) => {
    res.status(404).sendFile(pfadZu('client', '404.html'));
  });

  /**
   * Express-Fehlerbehandlung.
   *
   * Vier Parameter sind Pflicht, sonst erkennt Express die Funktion nicht als
   * Fehlerbehandler.
   */
  app.use((fehler, req, res, next) => {
    logger.error('HTTP-Fehler', fehler);

    // Wurde die Antwort schon begonnen, laesst sich kein Status mehr setzen.
    // Dann uebernimmt die eingebaute Behandlung von Express und schliesst die
    // Verbindung – ein zweiter Sendeversuch wuerde nur einen Folgefehler
    // erzeugen und die eigentliche Ursache im Protokoll verdecken.
    if (res.headersSent) {
      next(fehler);
      return;
    }

    res.status(500).json({ fehler: 'Interner Serverfehler' });
  });

  return app;
}

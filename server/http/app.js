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
 * Content-Security-Policy: Was darf der Browser auf dieser Seite laden und
 * ausfuehren? Eine Regel je Zeile, damit jede einzeln erklaerbar bleibt.
 *
 *   default-src 'self'      alles nur von DIESEM Server: Skripte, CSS,
 *                           Schrift und die Socket.io-Verbindung. Damit
 *                           laufen keine Inline-Skripte, keine
 *                           onclick-Attribute und kein eval – das Projekt
 *                           braucht nichts davon.
 *   img-src 'self' data:    dazu das leere Favicon (`href="data:,"`)
 *   object-src 'none'       keine Plugins
 *   base-uri 'none'         kein <base>-Element, das alle Pfade umbiegt
 *   frame-ancestors 'none'  die Seite darf nicht in fremde Seiten
 *                           eingebettet werden (Klick-Entfuehrung)
 */
export const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * @param {{manager: object, lobby: object}} deps  fuer den Gesundheitsendpunkt
 */
export function erzeugeApp({ manager, lobby }) {
  const app = express();

  // Verraet die Server-Technik nicht nach aussen.
  app.disable('x-powered-by');

  /**
   * Schutz gegen Cross-Site-Scripting (XSS) – die DRITTE Absicherung.
   *
   * Die erste steckt im Client: Texte wie Spielernamen werden nur ueber
   * textContent gesetzt, nie ueber innerHTML. Die zweite in der Namensregel:
   * `<` und `>` sind verboten (shared/protokoll.js). Diese Kopfzeilen greifen,
   * falls trotzdem einmal HTML eingeschleust wuerde: Der Browser fuehrt dann
   * nur Skripte von diesem Server aus.
   *
   * nosniff: Der Browser haelt sich an den angegebenen Dateityp und raet nicht
   * selbst – eine Textdatei wird so nie als Skript ausgefuehrt.
   */
  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

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

/**
 * logger.js – einheitliche Protokollausgabe.
 *
 * Schreibt Uhrzeit, Ebene und Nachricht. Standard ist info; abgelehnte
 * Züge und ignoriertes Abbrechen erscheinen erst mit LOG_LEVEL=debug.
 *
 * Inhalt (Cmd+F nach „== 2.“):
 *   == 1. Ebenen und Schwelle
 *   == 2. Zeitstempel
 *   == 3. Ausgabe und Schnittstelle
 *
 * Benutzt von: Servermodule. Benutzt die Node-Konsole als einzige
 * Ausgabestelle.
 */

// == 1. Ebenen und Schwelle ==============================================
// EINSTELLBAR: LOG_LEVEL=debug, info, warn oder error; Standard ist info.
const EBENEN = { debug: 10, info: 20, warn: 30, error: 40 };

const gewuenscht = (process.env.LOG_LEVEL ?? '').toLowerCase();
// SCHUTZ: Auch unbekannte oder geerbte Namen wie constructor fallen auf info.
const schwelle = Object.hasOwn(EBENEN, gewuenscht)
  ? EBENEN[gewuenscht] : EBENEN.info;

// == 2. Zeitstempel ======================================================
// UTC-Uhrzeit ohne Datum; kein Wechsel zwischen Sommer- und Winterzeit.
function zeitstempel() {
  return new Date().toISOString().slice(11, 19);
}

// == 3. Ausgabe und Schnittstelle ========================================
// Zusatzdaten als JSON, Fehler auf error mit Stacktrace (Aufrufliste).
function schreibe(ebene, text, zusatz) {
  if (EBENEN[ebene] < schwelle) return;

  const teile = [`${zeitstempel()} [${ebene.toUpperCase()}] ${text}`];

  if (zusatz !== undefined) {
    if (zusatz instanceof Error) {
      // Der Stack enthält die Meldung schon; sie nicht doppelt anhängen.
      if (ebene === 'error' && zusatz.stack) teile.push(`\n${zusatz.stack}`);
      else teile.push(`${zusatz.name}: ${zusatz.message}`);
    } else {
      try {
        teile.push(JSON.stringify(zusatz));
      } catch {
        // SCHUTZ: Kreisförmige Daten können nicht als JSON geschrieben werden.
        // Trotzdem die eigentliche Logmeldung ausgeben.
        teile.push('[nicht serialisierbar]');
      }
    }
  }

  const zeile = teile.join(' ');
  if (ebene === 'error') console.error(zeile);
  else if (ebene === 'warn') console.warn(zeile);
  else console.log(zeile);
}

export const logger = {
  debug: (text, zusatz) => schreibe('debug', text, zusatz),
  info: (text, zusatz) => schreibe('info', text, zusatz),
  warn: (text, zusatz) => schreibe('warn', text, zusatz),
  error: (text, zusatz) => schreibe('error', text, zusatz),
};

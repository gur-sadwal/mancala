/**
 * Einheitliche Protokollausgabe (Konzept 7.10).
 *
 * Eine einzige Ausgabestelle mit Zeitstempel und Ebene. Protokolliert werden
 * Verbindungsauf- und -abbau, Partiestart und -ende, jeder abgelehnte Zug mit
 * Grund sowie jeder Fehler. NICHT protokolliert werden vollstaendige Bretter
 * bei jedem Zug – bei 15 gleichzeitigen Partien waere die Ausgabe unlesbar.
 */

/** Ebenen in aufsteigender Dringlichkeit. */
const EBENEN = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Schwelle aus der Umgebung, Standard `info`.
 * LOG_LEVEL=debug macht die Ausgabe waehrend der Entwicklung gespraechiger.
 */
const schwelle = EBENEN[process.env.LOG_LEVEL] ?? EBENEN.info;

/** Zeitstempel HH:MM:SS in UTC (deutsche Sommerzeit = UTC + 2 Stunden). */
function zeitstempel() {
  return new Date().toISOString().slice(11, 19);
}

/**
 * Baut eine Zeile und gibt sie aus.
 *
 * Zusatzangaben werden als kompaktes JSON angehaengt, damit eine Zeile eine
 * Zeile bleibt. Ein Fehlerobjekt wird auf Name und Meldung reduziert; der
 * vollstaendige Stapelabzug erscheint nur auf der Ebene `error`.
 */
function schreibe(ebene, text, zusatz) {
  if (EBENEN[ebene] < schwelle) return;

  const teile = [`${zeitstempel()} [${ebene.toUpperCase()}] ${text}`];

  if (zusatz !== undefined) {
    if (zusatz instanceof Error) {
      teile.push(`${zusatz.name}: ${zusatz.message}`);
      if (ebene === 'error' && zusatz.stack) teile.push(`\n${zusatz.stack}`);
    } else {
      try {
        teile.push(JSON.stringify(zusatz));
      } catch {
        // Zirkulaere Struktur: lieber ein Hinweis als ein Absturz im Logger.
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

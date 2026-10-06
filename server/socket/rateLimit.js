/**
 * Ratenbegrenzung je Verbindung (Konzept 7.9).
 *
 * Jeder Socket zaehlt seine Ereignisse in einem Sekundenfenster. Ueber der
 * Grenze werden weitere verworfen und mit ZU_VIELE_ANFRAGEN beantwortet. Ein
 * Mensch kommt nie in die Naehe dieser Grenze; ein Skript, das Zuege flutet,
 * wird gebremst, ohne dass der Server bearbeitet werden muss (Fall F-06).
 *
 * Umgesetzt als einfaches Zaehlfenster, nicht als gleitendes Fenster: Der
 * Unterschied ist hier bedeutungslos, und ein Zaehler ist im Review in einem
 * Satz erklaert.
 */

/** Erlaubte Ereignisse je Fenster (Konzept 11.3). */
export const GRENZE_JE_FENSTER = 20;

/** Fensterlaenge in Millisekunden. */
export const FENSTER_MS = 1000;

/**
 * @param {number} grenze     erlaubte Ereignisse je Fenster
 * @param {number} fensterMs  Fensterlaenge
 * @param {() => number} uhr  Zeitquelle; im Test ersetzbar, damit kein Test
 *                            eine Sekunde lang warten muss
 */
export function erzeugeRatenbegrenzer(
  grenze = GRENZE_JE_FENSTER,
  fensterMs = FENSTER_MS,
  uhr = Date.now,
) {
  /** @type {Map<string, {fensterStart: number, anzahl: number}>} */
  const zaehler = new Map();

  /**
   * Meldet ein Ereignis an und sagt, ob es bearbeitet werden darf.
   * @returns {boolean} true = erlaubt, false = verworfen
   */
  function erlaubt(socketId) {
    const jetzt = uhr();
    const eintrag = zaehler.get(socketId);

    if (!eintrag || jetzt - eintrag.fensterStart >= fensterMs) {
      // Erstes Ereignis oder das alte Fenster ist abgelaufen: neu beginnen.
      zaehler.set(socketId, { fensterStart: jetzt, anzahl: 1 });
      return true;
    }

    eintrag.anzahl += 1;
    return eintrag.anzahl <= grenze;
  }

  /**
   * Raeumt den Zaehler eines getrennten Sockets ab.
   *
   * Ohne diesen Aufruf im `disconnect`-Handler waere die Map ein langsames
   * Speicherleck ueber viele kurze Verbindungen (NFA-10).
   */
  function vergiss(socketId) {
    zaehler.delete(socketId);
  }

  /** Anzahl beobachteter Verbindungen – nur fuer Diagnose und Tests. */
  function anzahl() {
    return zaehler.size;
  }

  return { erlaubt, vergiss, anzahl };
}

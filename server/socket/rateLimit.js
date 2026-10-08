/**
 * rateLimit.js – Nachrichten je Verbindung begrenzen.
 *
 * Zählt in festen Zeitfenstern. Die erste abgewiesene Nachricht bekommt
 * eine Antwort; weitere verworfene Nachrichten erzeugen keine Antwortflut.
 *
 * Inhalt (Cmd+F nach „== 2.“):
 *   == 1. Grenzen
 *   == 2. Nachrichten zählen
 *   == 3. Erste Sperre erkennen
 *   == 4. Getrennte Verbindungen vergessen
 *
 * Benutzt von: Gateway und Handler. Die Uhr lässt sich im Test ersetzen.
 */

// == 1. Grenzen ==========================================================
// EINSTELLBAR: Erlaubte Ereignisse je Zeitfenster und dessen Länge in ms.
const GRENZE_JE_FENSTER = 20;

const FENSTER_MS = 1000;

// == 2. Nachrichten zählen ===============================================
/** @param {Function} uhr Zeitquelle, damit Tests keine Sekunde warten. */
// An der Fenstergrenze sind zwei schnelle Gruppen möglich; kein gleitendes
// Limit.
export function erzeugeRatenbegrenzer(
  grenze = GRENZE_JE_FENSTER,
  fensterMs = FENSTER_MS,
  uhr = Date.now,
) {
  const zaehler = new Map();

  function erlaubt(socketId) {
    const jetzt = uhr();
    const eintrag = zaehler.get(socketId);

    if (!eintrag || jetzt - eintrag.fensterStart >= fensterMs) {
      zaehler.set(socketId, { fensterStart: jetzt, anzahl: 1 });
      return true;
    }

    eintrag.anzahl += 1;
    return eintrag.anzahl <= grenze;
  }

  // == 3. Erste Sperre erkennen ==========================================
  function istErsteSperre(socketId) {
    return zaehler.get(socketId)?.anzahl === grenze + 1;
  }

  // == 4. Getrennte Verbindungen vergessen ===============================
  // SCHUTZ: Ohne Löschen wächst die Map mit jeder neuen Verbindung weiter.
  function vergiss(socketId) {
    zaehler.delete(socketId);
  }

  function anzahl() {
    return zaehler.size;
  }

  return { erlaubt, istErsteSperre, vergiss, anzahl };
}

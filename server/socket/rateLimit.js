/**
 * rateLimit.js – Nachrichten je Verbindung begrenzen.
 *
 * Zählt in festen Zeitfenstern. Der Handler beantwortet nur die erste
 * abgewiesene Nachricht, damit die Sperre keine Antwortflut erzeugt.
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
// EINSTELLBAR: Erlaubte Nachrichten je Zeitfenster und dessen Länge in ms.
const GRENZE_JE_FENSTER = 20;
const FENSTER_MS = 1000;

// == 2. Nachrichten zählen ===============================================
// Feste Fenster sind einfach, lassen an der Fenstergrenze aber kurz bis zu
// doppelt so viele Nachrichten durch: Der Zähler beginnt dort wieder bei eins.
/** @param {Function} uhr Zeitquelle, damit Tests keine Sekunde warten. */
export function erzeugeRatenbegrenzer(
  grenze = GRENZE_JE_FENSTER,
  fensterMs = FENSTER_MS,
  uhr = Date.now,
) {
  const zaehler = new Map();

  function erlaubt(socketId) {
    const jetzt = uhr();
    const eintrag = zaehler.get(socketId);

    // ACHTUNG: Springt die Uhr zurück (jetzt < fensterStart), wäre die
    // Differenz negativ und das Fenster würde nie enden: neu beginnen.
    const neuesFenster = !eintrag
      || jetzt < eintrag.fensterStart
      || jetzt - eintrag.fensterStart >= fensterMs;

    if (neuesFenster) {
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

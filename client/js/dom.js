/**
 * Kleine DOM-Helfer (Konzept 3.3).
 *
 * Bewusst winzig: Das Projekt braucht keine Bibliothek, nur drei
 * wiederkehrende Handgriffe. Alles hier ist rein – kein Modul kennt den
 * Spielzustand.
 */

/** Kurzform fuer document.querySelector, mit sprechendem Fehler. */
export function $(auswahl, wurzel = document) {
  const element = wurzel.querySelector(auswahl);
  if (!element) {
    // Ein fehlendes Element ist immer ein Tippfehler im HTML oder im Selektor.
    // Lieber hier laut scheitern als spaeter still nichts tun.
    throw new Error(`Element nicht gefunden: ${auswahl}`);
  }
  return element;
}

/**
 * Erzeugt ein Element.
 *
 * @param {string} tag
 * @param {object} eigenschaften  klassen, text, attribute
 * @param {Node[]} kinder
 */
export function erzeuge(tag, { klassen = [], text, attribute = {} } = {}, kinder = []) {
  const element = document.createElement(tag);

  if (klassen.length > 0) element.classList.add(...klassen);

  // Immer textContent, nie innerHTML: Damit kann ein Spielername kein HTML
  // einschleusen (Konzept 6.2, 7.8).
  if (text !== undefined) element.textContent = String(text);

  for (const [name, wert] of Object.entries(attribute)) {
    element.setAttribute(name, String(wert));
  }

  element.append(...kinder);
  return element;
}

/**
 * Setzt Text nur, wenn er sich geaendert hat.
 *
 * Die Animation zeichnet das Brett bei jeder gesaeten Kugel neu. So werden
 * nur die Zahlen angefasst, die sich wirklich geaendert haben.
 */
export function setzeText(element, text) {
  const neu = String(text);
  if (element.textContent !== neu) element.textContent = neu;
}

/** Schaltet eine Klasse anhand einer Bedingung. */
export function schalte(element, klasse, an) {
  element.classList.toggle(klasse, Boolean(an));
}

/** Zeigt oder versteckt ein Element ueber das hidden-Attribut. */
export function zeige(element, sichtbar) {
  element.hidden = !sichtbar;
}

/**
 * Wartet eine Zeitspanne.
 *
 * Als Promise, damit die Animation in `spiel.js` als lesbare
 * `await`-Folge geschrieben werden kann statt als verschachtelte
 * setTimeout-Kette (Konzept 6.3 der Anforderungen: async/await statt
 * Callback-Verschachtelung).
 */
export function warte(ms) {
  return new Promise((fertig) => setTimeout(fertig, ms));
}

/**
 * Wie viele Sekunden einer Frist sind noch uebrig? Fuer den Revanche-Zaehler
 * im Ergebnisdialog (js/ende.js).
 *
 * Aufgerundet, wie bei jedem Countdown: Bei 0,4 s Rest steht noch "1 s" da,
 * die 0 erscheint erst, wenn die Zeit wirklich um ist. Nie unter 0 und nie
 * ueber der vollen Dauer – auch wenn die Uhr des Rechners zwischendurch
 * verstellt wird.
 *
 * Bewusst ohne DOM und ohne Import, damit Jest die Funktion testen kann.
 *
 * @param {number} startMs   Beginn der Frist (Date.now() beim Start)
 * @param {number} jetztMs   aktuelle Zeit (Date.now())
 * @param {number} dauerSek  Laenge der Frist in Sekunden
 */
export function restSekunden(startMs, jetztMs, dauerSek) {
  const rest = Math.ceil(dauerSek - (jetztMs - startMs) / 1000);
  return Math.min(dauerSek, Math.max(0, rest));
}

/**
 * Respektiert "weniger Bewegung" – aus der Einstellung im Spiel
 * (js/einstellungen.js) ODER aus der Systemeinstellung.
 *
 * Wird bei jedem Aufruf neu gelesen, damit eine Aenderung waehrend der Partie
 * sofort greift.
 */
export function wenigerBewegung() {
  return document.documentElement.dataset.bewegung === 'wenig'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

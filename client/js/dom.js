/**
 * dom.js – kleine Helfer für DOM, Wartezeiten und Bewegungseinstellungen.
 * Diese Datei kennt weder Spiellogik noch Netzwerkzustand.
 * Inhalt: == 1. Elemente und Klassen · == 2. Zeit und Bewegung
 * Benutzt von den Ansichten und main.js.
 */

// == 1. Elemente und Klassen =============================================
export function $(auswahl, wurzel = document) {
  const element = wurzel.querySelector(auswahl);
  // Ein fehlendes benötigtes Element ist ein Fehler im HTML oder im Selektor.
  if (!element) {
    throw new Error(`Element nicht gefunden: ${auswahl}`);
  }
  return element;
}

// Erzeugt ein Element mit Klassen, Text, Attributen und Kindern.
export function erzeuge(
  tag, { klassen = [], text, attribute = {} } = {}, kinder = [],
) {
  const element = document.createElement(tag);

  if (klassen.length > 0) element.classList.add(...klassen);

  // SCHUTZ: textContent behandelt Spielernamen als Text, ohne HTML auszuführen.
  if (text !== undefined) element.textContent = String(text);

  for (const [name, wert] of Object.entries(attribute)) {
    element.setAttribute(name, String(wert));
  }

  element.append(...kinder);
  return element;
}

// Unveränderter Text braucht keinen erneuten DOM-Schreibzugriff.
export function setzeText(element, text) {
  const neu = String(text);
  if (element.textContent !== neu) element.textContent = neu;
}

export function schalte(element, klasse, an) {
  element.classList.toggle(klasse, Boolean(an));
}

export function zeige(element, sichtbar) {
  element.hidden = !sichtbar;
}

// == 2. Zeit und Bewegung =================================================
export function warte(ms) {
  return new Promise((fertig) => setTimeout(fertig, ms));
}

// Aufrunden hält 0,4 Sekunden Rest als 1 sichtbar. Die Grenzen verhindern
// negative Restzeit und mehr als die volle Dauer bei zurückgestellter Uhr.
export function restSekunden(startMs, jetztMs, dauerSek) {
  const rest = Math.ceil(dauerSek - (jetztMs - startMs) / 1000);
  return Math.min(dauerSek, Math.max(0, rest));
}

// WCAG: Spieleinstellung oder Systemwunsch genügt. Bei jedem Zug neu lesen,
// damit eine geänderte Einstellung sofort wirkt.
export function wenigerBewegung() {
  return document.documentElement.dataset.bewegung === 'wenig'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

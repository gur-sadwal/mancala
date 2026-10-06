/**
 * Einstellungen des Spielers: groessere Schrift und weniger Animation.
 *
 * Die Tastaturhilfe ist bewusst KEINE Einstellung: Sie ist auf Rechnern und
 * Tablets immer an und nur auf Handys ausgeblendet (css/07-zustaende.css).
 *
 * Beim ersten Besuch oeffnet sich der Einstellungsdialog von selbst, spaeter
 * erreicht man ihn ueber den Knopf "Einstellungen" in der Kopfzeile.
 *
 * GESPEICHERT wird im localStorage, nicht in einem Cookie: Ein Cookie wuerde
 * bei JEDER Anfrage an den Server mitgeschickt, obwohl der Server die
 * Einstellungen nie braucht. localStorage bleibt im Browser – und ist schon
 * aus anmelden.js bekannt (gemerkter Spielername).
 *
 * WIRKUNG: Jede Einstellung wird als data-Attribut an <html> geschrieben, zum
 * Beispiel <html data-schrift="gross">. Was daraus folgt, steht allein im CSS.
 * Das JavaScript gestaltet kein einziges Element selbst um.
 */

import { $ } from './dom.js';

/** Schluessel im localStorage. */
const SPEICHER_EINSTELLUNGEN = 'mancala.einstellungen';

/**
 * Macht aus dem gespeicherten Text ein Einstellungsobjekt.
 *
 * Bewusst eine eigene, reine Funktion: Sie kennt weder DOM noch Speicher und
 * ist deshalb mit Jest testbar (tests/einstellungen.test.js).
 *
 *   null (nie gespeichert)     ->  null, also "erster Besuch"
 *   kaputter Text              ->  null, der Dialog erscheint einfach erneut
 *   fehlender oder falscher    ->  Standardwert
 *   Wert
 *
 * @param {string|null} text  Inhalt aus dem localStorage
 * @param {{grosseSchrift: boolean, wenigerAnimation: boolean}} standard
 * @returns {object|null}
 */
export function ausSpeichertext(text, standard) {
  if (text === null) return null;

  let gespeichert;
  try {
    gespeichert = JSON.parse(text);
  } catch {
    return null;
  }

  // JSON.parse liefert auch Zahlen, Texte oder null – das sind keine
  // Einstellungen.
  if (typeof gespeichert !== 'object' || gespeichert === null) return null;

  // Nur die bekannten Namen und nur echte true/false-Werte uebernehmen.
  const einstellungen = {};
  for (const name of Object.keys(standard)) {
    einstellungen[name] = typeof gespeichert[name] === 'boolean'
      ? gespeichert[name]
      : standard[name];
  }
  return einstellungen;
}

/**
 * Baut den Einstellungsdialog auf und wendet die gespeicherten Einstellungen
 * SOFORT an – also schon, bevor irgendeine Ansicht gezeichnet wird.
 *
 * @returns {{zeigeBeimErstenBesuch: Function, raeumeAuf: Function}}
 */
export function erzeugeEinstellungen() {
  const dialog = $('#dialog-einstellungen');
  const formular = $('#form-einstellungen');
  const knopfOeffnen = $('#knopf-einstellungen');

  /** Standardwerte beim ersten Besuch. */
  const standard = {
    grosseSchrift: false,
    wenigerAnimation: false,
  };

  /**
   * Gespeicherte Einstellungen – oder null beim ersten Besuch.
   *
   * In try/catch aus demselben Grund wie in anmelden.js: Ist der Speicher
   * gesperrt, wirft schon der Zugriff eine Ausnahme.
   */
  function lies() {
    try {
      return ausSpeichertext(window.localStorage.getItem(SPEICHER_EINSTELLUNGEN), standard);
    } catch {
      return null;
    }
  }

  /** Speichert – scheitert das, gelten die Einstellungen bis zum Neuladen. */
  function speichere(einstellungen) {
    try {
      window.localStorage.setItem(SPEICHER_EINSTELLUNGEN, JSON.stringify(einstellungen));
    } catch {
      // Kein Speicher verfuegbar: Die Einstellungen wirken trotzdem weiter.
    }
  }

  /**
   * Wendet Einstellungen an: eine Zeile je Einstellung.
   *
   * Die Attribute stehen an <html>, damit das CSS mit EINER Regel die ganze
   * Seite erreicht (z. B. `html[data-schrift="gross"]`).
   */
  function wendeAn(einstellungen) {
    const html = document.documentElement;
    html.dataset.schrift = einstellungen.grosseSchrift ? 'gross' : 'normal';
    html.dataset.bewegung = einstellungen.wenigerAnimation ? 'wenig' : 'normal';
  }

  /** Setzt die Haken im Formular passend zu den Einstellungen. */
  function fuelleFormular(einstellungen) {
    for (const name of Object.keys(standard)) {
      formular.elements[name].checked = einstellungen[name];
    }
  }

  /** Liest die Haken aus dem Formular. */
  function ausFormular() {
    const einstellungen = {};
    for (const name of Object.keys(standard)) {
      einstellungen[name] = formular.elements[name].checked;
    }
    return einstellungen;
  }

  /** Beim ersten Besuch null – daran erkennt `zeigeBeimErstenBesuch` ihn. */
  const gespeichert = lies();

  /** Die Einstellungen, die gerade gelten. */
  let aktuell = gespeichert ?? standard;
  wendeAn(aktuell);

  /** Jeder Haken wirkt sofort – man sieht direkt, was er bewirkt. */
  function beiAenderung() {
    wendeAn(ausFormular());
  }

  /**
   * Dialog geschlossen – egal ob mit "Übernehmen" oder der Esc-Taste.
   *
   * Gespeichert wird, was gerade angehakt ist. Weil jeder Haken ohnehin schon
   * sofort wirkt (beiAenderung), gilt einfach: Was man sieht, wird gespeichert.
   * Auch Esc beim ersten Besuch speichert – sonst kaeme der Dialog bei jedem
   * Besuch wieder.
   */
  function beiSchliessen() {
    aktuell = ausFormular();
    wendeAn(aktuell);
    speichere(aktuell);
  }

  /** Klick auf "Einstellungen" in der Kopfzeile. */
  function beiOeffnen() {
    fuelleFormular(aktuell);
    dialog.showModal();
  }

  formular.addEventListener('change', beiAenderung);
  dialog.addEventListener('close', beiSchliessen);
  knopfOeffnen.addEventListener('click', beiOeffnen);

  return {
    /** Oeffnet den Dialog nur, wenn noch nie etwas gespeichert wurde. */
    zeigeBeimErstenBesuch() {
      if (gespeichert === null) beiOeffnen();
    },

    raeumeAuf() {
      formular.removeEventListener('change', beiAenderung);
      dialog.removeEventListener('close', beiSchliessen);
      knopfOeffnen.removeEventListener('click', beiOeffnen);
    },
  };
}

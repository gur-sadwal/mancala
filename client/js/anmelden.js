/**
 * Ansicht ANMELDEN (Konzept 8.1).
 *
 * Zeigt das Namensformular und schickt `spiel:beitreten`. Sie kennt die
 * Spielregeln nicht – nur ein Textfeld, die Wahl der Spielart und einen Knopf.
 *
 * Spielart:
 *   schnell   oeffentliche Warteschlange
 *   privat    eigenes Spiel erstellen, Link an einen Freund schicken
 *   Einladung Seite wurde ueber einen Link (?spiel=K7M2QX) geoeffnet – dann
 *             gibt es nichts zu waehlen, man tritt genau diesem Spiel bei
 */

import { $, zeige, setzeText } from './dom.js';

/** Schluessel, unter dem der zuletzt benutzte Name gemerkt wird. */
const SPEICHER_NAME = 'mancala.name';

/**
 * Baut die Anmeldeansicht auf und meldet ihre Listener an.
 *
 * @param {{aktionen: object}} deps  die Sendefunktionen aus kern.js
 * @returns {{zeige: Function, melde: Function, raeumeAuf: Function}}
 */
export function erzeugeAnmeldeAnsicht({ aktionen }) {
  const abschnitt = $('#ansicht-anmelden');
  const formular = $('#form-anmelden');
  const feldName = $('#feld-name');
  const fehler = $('#anmelden-fehler');
  const titel = $('#t-anmelden');
  const umschalter = $('#spielart');
  const einladungHinweis = $('#einladung');
  const knopf = $('#knopf-anmelden');

  /** Code aus dem Einladungslink – oder null, wenn es keinen gibt. */
  let einladung = null;

  /**
   * Namen aus dem letzten Besuch vorausfuellen.
   *
   * In try/catch, weil der Zugriff auf localStorage im privaten Modus
   * mancher Browser eine Ausnahme wirft – eine Bequemlichkeit darf die
   * Anmeldung nicht verhindern.
   */
  try {
    const gemerkt = window.localStorage.getItem(SPEICHER_NAME);
    if (gemerkt) feldName.value = gemerkt;
  } catch {
    // Kein Speicher verfuegbar: Das Feld bleibt leer, sonst aendert sich nichts.
  }

  /** Zeigt eine Fehlermeldung an oder blendet sie aus (leerer Text). */
  function zeigeFehler(text) {
    setzeText(fehler, text);
    zeige(fehler, Boolean(text));
  }

  /** Ist im Umschalter "Privates Spiel" gewaehlt? */
  function istPrivatGewaehlt() {
    // `elements.spielart` fasst beide Radiobuttons zusammen; `value` ist der
    // Wert des angekreuzten.
    return formular.elements.spielart.value === 'privat';
  }

  /** Knopftext passend zur Auswahl – man soll vorher wissen, was passiert. */
  function aktualisiereKnopf() {
    if (einladung) {
      setzeText(knopf, 'Spiel beitreten');
    } else if (istPrivatGewaehlt()) {
      setzeText(knopf, 'Privates Spiel erstellen');
    } else {
      setzeText(knopf, 'Gegner suchen');
    }
  }

  /**
   * Liest den Einladungscode aus der Adresse und passt das Formular an.
   *
   * Wird bei jedem Anzeigen neu gelesen, weil main.js den Code nach dem
   * Partiestart (oder bei einem ungueltigen Link) aus der Adresse entfernt.
   */
  function aktualisiereEinladung() {
    einladung = new URLSearchParams(window.location.search).get('spiel') || null;

    zeige(umschalter, !einladung);
    zeige(einladungHinweis, Boolean(einladung));
    aktualisiereKnopf();
  }

  /**
   * Absenden des Formulars.
   *
   * `preventDefault`, weil das Formular nichts an eine URL schickt, sondern
   * ein Socket-Ereignis ausloest.
   */
  function beiAbsenden(ereignis) {
    ereignis.preventDefault();

    const name = feldName.value.trim();

    if (name.length === 0) {
      zeigeFehler('Bitte gib einen Namen ein.');
      feldName.focus();
      return;
    }

    zeigeFehler('');

    try {
      window.localStorage.setItem(SPEICHER_NAME, name);
    } catch {
      // Siehe oben: Speichern ist optional.
    }

    aktionen.beitreten(name, { privat: istPrivatGewaehlt(), code: einladung });
  }

  formular.addEventListener('submit', beiAbsenden);
  formular.addEventListener('change', aktualisiereKnopf);

  return {
    zeige(sichtbar) {
      // main.js ruft zeige() bei JEDER Zustandsaenderung auf. Fokus und
      // Fehlermeldung deshalb nur beim echten Einblenden anfassen – sonst
      // wuerde z. B. ein Verbindungswechsel eine Meldung wieder loeschen.
      const wirdEingeblendet = sichtbar && abschnitt.hidden;

      zeige(abschnitt, sichtbar);
      if (!sichtbar) return;

      aktualisiereEinladung();

      if (wirdEingeblendet) {
        // Fokus auf die Ueberschrift, damit der Wechsel bemerkt wird; von dort
        // geht es per Tabulator ins Feld.
        titel.focus();
        zeigeFehler('');
      }
    },

    /** Meldet einen Fehler des Servers im Formular. */
    melde(text) {
      zeigeFehler(text);
    },

    /** Listener abmelden – gegen Speicherlecks (Konzept 6.3 der Anforderungen). */
    raeumeAuf() {
      formular.removeEventListener('submit', beiAbsenden);
      formular.removeEventListener('change', aktualisiereKnopf);
    },
  };
}

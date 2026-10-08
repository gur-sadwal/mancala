/**
 * anmelden.js – Namensformular und Auswahl der Spielart.
 * Der Client prüft für direkte Rückmeldung; verbindlich prüft der Server.
 * Inhalt: == 1. Einrichtung · == 2. Formularaktionen · == 3. Ansicht
 * Benutzt von main.js; benutzt dom.js und shared/protokoll.js.
 */

import { $, zeige, setzeText } from './dom.js';
import { bereinigeName, NAME_VERBOTEN } from '/shared/protokoll.js';

// == 1. Einrichtung ======================================================
const SPEICHER_NAME = 'mancala.name';

export function erzeugeAnmeldeAnsicht({ aktionen, beiAnmeldung }) {
  const abschnitt = $('#ansicht-anmelden');
  const formular = $('#form-anmelden');
  const feldName = $('#feld-name');
  const fehler = $('#anmelden-fehler');
  const titel = $('#t-anmelden');
  const umschalter = $('#spielart');
  const einladungHinweis = $('#einladung');
  const knopf = $('#knopf-anmelden');

  let einladung = null;

  // Speicher ist optional: Ein gesperrter Browser-Speicher darf nicht
  // blockieren.
  try {
    const gemerkt = window.localStorage.getItem(SPEICHER_NAME);
    if (gemerkt) feldName.value = gemerkt;
  } catch {
    // Speichern ist optional; die Anzeige bleibt im Arbeitsspeicher erhalten.
  }

  // == 2. Formularaktionen =================================================
  function zeigeFehler(text) {
    setzeText(fehler, text);
    zeige(fehler, Boolean(text));
  }

  function istPrivatGewaehlt() {
    return formular.elements.spielart.value === 'privat';
  }

  function aktualisiereKnopf() {
    if (einladung) {
      setzeText(knopf, 'Spiel beitreten');
    } else if (istPrivatGewaehlt()) {
      setzeText(knopf, 'Privates Spiel erstellen');
    } else {
      setzeText(knopf, 'Gegner suchen');
    }
  }

  // Beim Anzeigen neu lesen: main.js entfernt verbrauchte oder ungültige Links.
  function aktualisiereEinladung() {
    einladung = new URLSearchParams(window.location.search).get('spiel') || null;

    zeige(umschalter, !einladung);
    zeige(einladungHinweis, Boolean(einladung));
    aktualisiereKnopf();
  }

  // SCHUTZ: Die gemeinsame Namensregel vermeidet abweichende Vorprüfungen.
  function beiAbsenden(ereignis) {
    ereignis.preventDefault();

    // Verbotene Zeichen erklären, statt den Namen unbemerkt zu verändern.
    const verboten = [...feldName.value].some((zeichen) => NAME_VERBOTEN.includes(zeichen));
    if (verboten) {
      zeigeFehler('Die Zeichen < und > sind im Namen nicht erlaubt.');
      feldName.focus();
      return;
    }

    const name = bereinigeName(feldName.value);

    if (name.length === 0) {
      zeigeFehler('Bitte gib einen Namen ein.');
      feldName.focus();
      return;
    }

    feldName.value = name;
    zeigeFehler('');

    try {
      window.localStorage.setItem(SPEICHER_NAME, name);
    } catch {
      // Speichern ist optional; die Anzeige bleibt im Arbeitsspeicher erhalten.
    }

    // Nur dieser Absende-Listener reicht den fertig bereinigten Namen weiter.
    beiAnmeldung(name);
    aktionen.beitreten(name, { privat: istPrivatGewaehlt(), code: einladung });
  }

  // == 3. Ansicht ==========================================================
  function meldeListenerAn() {
    formular.addEventListener('submit', beiAbsenden);
    formular.addEventListener('change', aktualisiereKnopf);
  }

  function meldeListenerAb() {
    formular.removeEventListener('submit', beiAbsenden);
    formular.removeEventListener('change', aktualisiereKnopf);
  }

  // Listener nur während der sichtbaren Ansicht; gleiche Referenz verhindert
  // Doppelung.
  return {
    zeige(sichtbar) {
      // Fokus und Fehlertext nur beim echten Wechsel anfassen, nicht bei jedem
      // Store-Update.
      const wirdEingeblendet = sichtbar && abschnitt.hidden;

      zeige(abschnitt, sichtbar);
      if (!sichtbar) {
        meldeListenerAb();
        return;
      }

      meldeListenerAn();
      aktualisiereEinladung();

      if (wirdEingeblendet) {
        titel.focus();
        zeigeFehler('');
      }
    },

    melde(text) {
      zeigeFehler(text);
    },
  };
}

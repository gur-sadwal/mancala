/**
 * anmelden.js – Namensformular und Auswahl der Spielart.
 * Der Client prüft für direkte Rückmeldung; verbindlich prüft der Server.
 * Inhalt: == 1. Einrichtung · == 2. Formularaktionen · == 3. Ansicht
 * Benutzt von main.js; benutzt dom.js und shared/protokoll.js.
 */

import { $, zeige, setzeText } from './dom.js';
import {
  bereinigeName, NAME_VERBOTEN, CODE_ZEICHEN, GRENZEN,
} from '/shared/protokoll.js';

// == 1. Einrichtung ======================================================
const SPEICHER_NAME = 'mancala.name';

const UNGUELTIGER_LINK = 'Der Einladungslink ist ungültig oder unvollständig. '
  + 'Du kannst stattdessen ein neues Spiel suchen.';

const OHNE_VERBINDUNG = 'Ohne Verbindung wurde dein Beitritt nicht gesendet. '
  + 'Versuche es erneut, sobald die Verbindung wieder steht.';

// SCHUTZ: Der Code kommt aus der Adresse und ist frei veränderbar. Nur Codes
// in Länge und Zeichensatz der Server-Codes werden verwendet; ein 3000-Zeichen-
// Link würde sonst die Verbindung trennen (Puffergrenze des Servers). Der
// Server prüft den Code trotzdem selbst. Kleinschreibung nimmt er an, daher
// wird hier zuerst vergrößert.
export function leseEinladung(suchtext) {
  const roh = new URLSearchParams(suchtext).get('spiel');
  if (!roh) return null;

  // Chat-Programme hängen gern ein Leerzeichen an den Link.
  const code = roh.trim().toUpperCase();
  const laengeStimmt = code.length === GRENZEN.CODE_LAENGE;
  const zeichenStimmen = [...code].every((z) => CODE_ZEICHEN.includes(z));
  return laengeStimmt && zeichenStimmen ? code : null;
}

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

  // Der gemerkte Name ist optional; gesperrter Speicher darf die Anmeldung
  // nicht verhindern.
  try {
    const gemerkt = window.localStorage.getItem(SPEICHER_NAME);
    if (gemerkt) feldName.value = gemerkt;
  } catch {
    // Ein Name lässt sich auch ohne gespeicherten Wert eingeben.
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

  // SCHUTZ: Ein vorhandener, aber ungültiger Link darf nicht stumm zur
  // öffentlichen Suche werden. Die Meldung sagt es; die Adresse wird wie bei
  // main.js (entferneEinladungAusAdresse) bereinigt, damit sie nicht bleibt.
  function meldeUngueltigenLink() {
    zeigeFehler(UNGUELTIGER_LINK);
    window.history.replaceState(null, '', window.location.pathname);
  }

  // Beim Anzeigen neu lesen: main.js entfernt verbrauchte Links, ungültige
  // entfernt meldeUngueltigenLink.
  function aktualisiereEinladung() {
    const suchtext = window.location.search;
    einladung = leseEinladung(suchtext);
    const hatParameter = Boolean(new URLSearchParams(suchtext).get('spiel'));
    if (hatParameter && !einladung) meldeUngueltigenLink();

    zeige(umschalter, !einladung);
    zeige(einladungHinweis, Boolean(einladung));
    aktualisiereKnopf();
  }

  // SCHUTZ: Die gemeinsame Namensregel vermeidet abweichende Vorprüfungen.
  function beiAbsenden(ereignis) {
    ereignis.preventDefault();

    // Verbotene Zeichen erklären, statt den Namen unbemerkt zu verändern.
    const verboten = [...feldName.value].some(
      (zeichen) => NAME_VERBOTEN.includes(zeichen),
    );
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
      // Der Name gilt trotzdem für diese Anmeldung; nur das Merken entfällt.
    }

    // Nur dieser Absende-Listener reicht den fertig bereinigten Namen weiter.
    beiAnmeldung(name);
    const gesendet = aktionen.beitreten(
      name, { privat: istPrivatGewaehlt(), code: einladung },
    );

    // Ohne Verbindung geht der Beitritt nicht hinaus; die Ansicht sagt das.
    if (!gesendet) zeigeFehler(OHNE_VERBINDUNG);
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

  // Listener gelten nur für die sichtbare Ansicht. Gleiche Rückrufe werden
  // auch bei wiederholtem Zeichnen nicht doppelt angemeldet.
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

      // Erst alten Fehlertext löschen, dann kann der Link-Check neu melden.
      if (wirdEingeblendet) zeigeFehler('');
      aktualisiereEinladung();
      if (wirdEingeblendet) titel.focus();
    },

    melde(text) {
      zeigeFehler(text);
    },
  };
}

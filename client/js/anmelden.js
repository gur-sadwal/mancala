/**
 * anmelden.js – Namensformular, Auswahl der Spielart und Raumcode.
 * Der Client prüft für direkte Rückmeldung; verbindlich prüft der Server.
 * Inhalt: == 1. Einrichtung · == 2. Formularaktionen · == 3. Ansicht
 * Benutzt von main.js; benutzt dom.js und shared/protokoll.js.
 */

import { $, zeige, setzeText } from './dom.js';
import {
  bereinigeName, NAME_VERBOTEN, normalisiereCode, hatCodeForm, GRENZEN,
} from '/shared/protokoll.js';

// == 1. Einrichtung ======================================================
const SPEICHER_NAME = 'mancala.name';

const UNGUELTIGER_LINK = 'Der Einladungslink ist ungültig oder unvollständig. '
  + 'Du kannst stattdessen ein neues Spiel suchen.';

const OHNE_VERBINDUNG = 'Ohne Verbindung wurde dein Beitritt nicht gesendet. '
  + 'Versuche es erneut, sobald die Verbindung wieder steht.';

const CODE_FEHLT = 'Bitte gib den Raumcode ein.';
const CODE_UNGUELTIG = 'Das ist kein gültiger Raumcode. Bitte prüfe die '
  + `${GRENZEN.CODE_LAENGE} Zeichen.`;

// Dieselbe Regel wie auf dem Server (validation.js): erst normalisieren,
// dann streng prüfen. Liefert den kanonischen Code oder null.
export function leseCode(text) {
  const code = normalisiereCode(text);
  return hatCodeForm(code) ? code : null;
}

// SCHUTZ: Der Code kommt aus der Adresse und ist frei veränderbar. Nur Codes
// mit Länge und Zeichensatz der Server-Codes gehen hinaus; ein Link mit 3000
// Zeichen würde sonst die Verbindung trennen (1 KB Puffergrenze des Servers).
// Der Server prüft den Code trotzdem selbst.
export function leseEinladung(suchtext) {
  const roh = new URLSearchParams(suchtext).get('spiel');
  if (!roh) return null;

  // Chat-Programme hängen gern ein Leerzeichen an den Link; leseCode
  // entfernt es wie die Bindestriche der gruppierten Anzeige.
  return leseCode(roh);
}

export function erzeugeAnmeldeAnsicht({ aktionen, beiAnmeldung }) {
  const abschnitt = $('#ansicht-anmelden');
  const formular = $('#form-anmelden');
  const feldName = $('#feld-name');
  const fehler = $('#anmelden-fehler');
  const titel = $('#t-anmelden');
  const umschalter = $('#spielart');
  const einladungHinweis = $('#einladung');
  const codeBlock = $('#code-eingabe');
  const feldCode = $('#feld-code');
  const knopf = $('#knopf-anmelden');

  let einladung = null;

  // Der gemerkte Name ist optional; gesperrter Speicher blockiert nichts.
  try {
    const gemerkt = window.localStorage.getItem(SPEICHER_NAME);
    if (gemerkt) feldName.value = gemerkt;
  } catch {
    // Dann bleibt das Feld leer.
  }

  // == 2. Formularaktionen =================================================
  function zeigeFehler(text) {
    setzeText(fehler, text);
    zeige(fehler, Boolean(text));
  }

  function istPrivatGewaehlt() {
    return formular.elements.spielart.value === 'privat';
  }

  // Ein Code aus dem Link hat Vorrang; dann bleibt das Codefeld versteckt.
  function istCodeGewaehlt() {
    return !einladung && formular.elements.spielart.value === 'code';
  }

  function aktualisiereAuswahl() {
    zeige(codeBlock, istCodeGewaehlt());

    if (einladung || istCodeGewaehlt()) {
      setzeText(knopf, 'Spiel beitreten');
    } else if (istPrivatGewaehlt()) {
      setzeText(knopf, 'Privates Spiel erstellen');
    } else {
      setzeText(knopf, 'Gegner suchen');
    }
  }

  // SCHUTZ: Ein vorhandener, aber ungültiger Link darf nicht stumm zur
  // öffentlichen Suche werden. Die Adresse wird wie in main.js
  // (entferneEinladungAusAdresse) bereinigt; sonst käme die Meldung bei jedem
  // Anzeigen der Anmeldung wieder.
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
    aktualisiereAuswahl();
  }

  // SCHUTZ: Die gemeinsame Namensregel vermeidet abweichende Vorprüfungen.
  // Liefert den bereinigten Namen oder null; die Meldung steht dann schon.
  function pruefeName() {
    // Verbotene Zeichen erklären, statt den Namen unbemerkt zu verändern.
    const verboten = [...feldName.value].some(
      (zeichen) => NAME_VERBOTEN.includes(zeichen),
    );
    if (verboten) {
      zeigeFehler('Die Zeichen < und > sind im Namen nicht erlaubt.');
      feldName.focus();
      return null;
    }

    const name = bereinigeName(feldName.value);

    if (name.length === 0) {
      zeigeFehler('Bitte gib einen Namen ein.');
      feldName.focus();
      return null;
    }
    return name;
  }

  // Ohne Codefeld gibt es nichts zu prüfen. Ein leeres Feld bekommt eine
  // eigene, kürzere Meldung als ein falsch abgetippter Code.
  function pruefeCodeFeld() {
    if (!istCodeGewaehlt() || leseCode(feldCode.value)) return true;

    const leer = normalisiereCode(feldCode.value) === '';
    zeigeFehler(leer ? CODE_FEHLT : CODE_UNGUELTIG);
    feldCode.focus();
    return false;
  }

  // Der Code aus dem Link, aus dem Feld oder null für eine neue Suche.
  function gewaehlterCode() {
    if (einladung) return einladung;
    return istCodeGewaehlt() ? leseCode(feldCode.value) : null;
  }

  function merkeName(name) {
    try {
      window.localStorage.setItem(SPEICHER_NAME, name);
    } catch {
      // Der Name gilt trotzdem für diese Anmeldung; nur das Merken entfällt.
    }
  }

  function beiAbsenden(ereignis) {
    ereignis.preventDefault();

    const name = pruefeName();
    if (name === null || !pruefeCodeFeld()) return;

    feldName.value = name;
    zeigeFehler('');
    merkeName(name);

    // main.js merkt sich den bereinigten Namen und gibt die Suche wieder frei.
    beiAnmeldung(name);
    const gesendet = aktionen.beitreten(
      name, { privat: istPrivatGewaehlt(), code: gewaehlterCode() },
    );

    if (!gesendet) zeigeFehler(OHNE_VERBINDUNG);
  }

  // == 3. Ansicht ==========================================================
  function meldeListenerAn() {
    formular.addEventListener('submit', beiAbsenden);
    formular.addEventListener('change', aktualisiereAuswahl);
  }

  function meldeListenerAb() {
    formular.removeEventListener('submit', beiAbsenden);
    formular.removeEventListener('change', aktualisiereAuswahl);
  }

  // Listener gelten nur für die sichtbare Ansicht. Gleiche Rückrufe werden
  // auch bei wiederholtem Zeichnen nicht doppelt angemeldet.
  return {
    zeige(sichtbar) {
      // Fokus und Fehlertext nur beim echten Wechsel, nicht bei Store-Updates.
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

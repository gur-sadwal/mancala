/**
 * einstellungen.js – größere Schrift und weniger Animation.
 * localStorage merkt die Wahl, falls verfügbar. Das CSS liest die Attribute
 * am html-Element; die Bewegungsabfrage in dom.js liest sie ebenfalls.
 * Inhalt: == 1. Gespeicherte Werte · == 2. Dialog
 * Benutzt von main.js; benutzt dom.js.
 */

import { $ } from './dom.js';

// == 1. Gespeicherte Werte ================================================
const SPEICHER_EINSTELLUNGEN = 'mancala.einstellungen';

// null öffnet den Erstbesuch-Dialog. Ungültiger Speichertext gilt ebenfalls
// als erster Besuch; fehlende bekannte Werte erhalten den Standard.
export function ausSpeichertext(text, standard) {
  if (text === null) return null;

  let gespeichert;
  try {
    gespeichert = JSON.parse(text);
  } catch {
    return null;
  }

  if (typeof gespeichert !== 'object' || gespeichert === null
    || Array.isArray(gespeichert)) return null;

  const einstellungen = {};
  for (const name of Object.keys(standard)) {
    einstellungen[name] = typeof gespeichert[name] === 'boolean'
      ? gespeichert[name]
      : standard[name];
  }
  return einstellungen;
}

// == 2. Dialog ===========================================================
export function erzeugeEinstellungen() {
  const dialog = $('#dialog-einstellungen');
  const formular = $('#form-einstellungen');
  const knopfOeffnen = $('#knopf-einstellungen');

  const standard = {
    grosseSchrift: false,
    wenigerAnimation: false,
  };

  // Ohne lesbaren Speicher scheitert auch das Speichern. Der Erstbesuch-Dialog
  // käme dann bei jedem Laden wieder; deshalb gilt der Standard ohne Dialog.
  function lies() {
    try {
      const text = window.localStorage.getItem(SPEICHER_EINSTELLUNGEN);
      return { gespeichert: ausSpeichertext(text, standard), lesbar: true };
    } catch {
      return { gespeichert: null, lesbar: false };
    }
  }

  function speichere(einstellungen) {
    try {
      window.localStorage.setItem(
        SPEICHER_EINSTELLUNGEN, JSON.stringify(einstellungen),
      );
    } catch {
      // Speichern ist optional; die Anzeige bleibt im Arbeitsspeicher erhalten.
    }
  }

  // Nur Attribute setzen: Schriftgrößen und Bewegungsregeln stehen im CSS.
  function wendeAn(einstellungen) {
    const html = document.documentElement;
    html.dataset.schrift = einstellungen.grosseSchrift ? 'gross' : 'normal';
    html.dataset.bewegung = einstellungen.wenigerAnimation ? 'wenig' : 'normal';
  }

  function fuelleFormular(einstellungen) {
    for (const name of Object.keys(standard)) {
      formular.elements[name].checked = einstellungen[name];
    }
  }

  function ausFormular() {
    const einstellungen = {};
    for (const name of Object.keys(standard)) {
      einstellungen[name] = formular.elements[name].checked;
    }
    return einstellungen;
  }

  const { gespeichert, lesbar } = lies();

  let aktuell = gespeichert ?? standard;
  wendeAn(aktuell);

  function beiAenderung() {
    wendeAn(ausFormular());
  }

  // Auch Esc übernimmt die bereits sichtbare Wahl. Ein gespeicherter Standard
  // verhindert, dass der Erstbesuch-Dialog beim Neuladen wieder erscheint.
  function beiSchliessen() {
    aktuell = ausFormular();
    wendeAn(aktuell);
    speichere(aktuell);
  }

  function beiOeffnen() {
    fuelleFormular(aktuell);
    dialog.showModal();
  }

  // Seitenweite Ausnahme: Einstellungen gehören zu keiner einzelnen Ansicht.
  formular.addEventListener('change', beiAenderung);
  dialog.addEventListener('close', beiSchliessen);
  knopfOeffnen.addEventListener('click', beiOeffnen);

  return {
    zeigeBeimErstenBesuch() {
      if (lesbar && gespeichert === null) beiOeffnen();
    },
  };
}

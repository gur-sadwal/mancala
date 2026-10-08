/**
 * einstellungen.js – größere Schrift und weniger Animation.
 * Einstellungen bleiben in localStorage; das CSS liest Attribute am
 * html-Element.
 * Inhalt: == 1. Gespeicherte Werte · == 2. Dialog
 * Benutzt von main.js; benutzt dom.js.
 */

import { $ } from './dom.js';

// == 1. Gespeicherte Werte ================================================
const SPEICHER_EINSTELLUNGEN = 'mancala.einstellungen';

// Kaputter Text gilt als erster Besuch; fehlende bekannte Werte erhalten den
// Standard.
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

  function lies() {
    try {
      return ausSpeichertext(window.localStorage.getItem(SPEICHER_EINSTELLUNGEN), standard);
    } catch {
      return null;
    }
  }

  function speichere(einstellungen) {
    try {
      window.localStorage.setItem(SPEICHER_EINSTELLUNGEN, JSON.stringify(einstellungen));
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

  const gespeichert = lies();

  let aktuell = gespeichert ?? standard;
  wendeAn(aktuell);

  function beiAenderung() {
    wendeAn(ausFormular());
  }

  // Auch Esc speichert, was bereits sichtbar wirkte; sonst öffnet der
  // Erstbesuch erneut.
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
      if (gespeichert === null) beiOeffnen();
    },
  };
}

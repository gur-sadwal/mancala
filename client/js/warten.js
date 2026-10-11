/**
 * warten.js – Warteposition oder privater Einladungslink.
 * Die Suche und ihre Position kommen vom Server; Abbrechen ist sofort sichtbar.
 * Inhalt: == 1. Einrichtung · == 2. Aktionen · == 3. Ansicht
 * Benutzt von main.js; benutzt dom.js.
 */

import { $, zeige, setzeText } from './dom.js';

// == 1. Einrichtung ======================================================
export function erzeugeWarteAnsicht({ aktionen, beiAbbrechen }) {
  const abschnitt = $('#ansicht-warten');
  const titel = $('#t-warten');
  const nameAnzeige = $('#warten-name');
  const positionAnzeige = $('#warten-position');
  const knopfAbbrechen = $('#knopf-abbrechen');
  const privatBlock = $('#warten-privat');
  const feldLink = $('#feld-link');
  const knopfKopieren = $('#knopf-kopieren');
  const kopierStatus = $('#kopier-status');

  // == 2. Aktionen =========================================================
  function beiAbbrechenKlick() {
    aktionen.abbrechen();
    // Der Server schickt keine Bestätigung; main.js wechselt selbst zurück.
    beiAbbrechen();
  }

  // Zuerst markieren: Falls die Zwischenablage fehlt, lässt sich der Link
  // selbst kopieren.
  async function beiKopieren() {
    feldLink.select();

    try {
      await navigator.clipboard.writeText(feldLink.value);
      setzeText(
        kopierStatus, 'Link kopiert! Schicke ihn jetzt deinem Mitspieler.',
      );
    } catch {
      setzeText(
        kopierStatus,
        'Kopieren ging nicht. Der Link ist markiert – kopiere ihn mit Cmd+C bzw. Strg+C.',
      );
    }
  }

  // == 3. Ansicht ==========================================================
  function meldeListenerAn() {
    knopfAbbrechen.addEventListener('click', beiAbbrechenKlick);
    knopfKopieren.addEventListener('click', beiKopieren);
  }

  function meldeListenerAb() {
    knopfAbbrechen.removeEventListener('click', beiAbbrechenKlick);
    knopfKopieren.removeEventListener('click', beiKopieren);
  }

  return {
    zeige(sichtbar) {
      // Ein Positionsupdate soll den Fokus nicht vom Kopierknopf wegziehen.
      const wirdEingeblendet = sichtbar && abschnitt.hidden;

      zeige(abschnitt, sichtbar);
      if (sichtbar) {
        meldeListenerAn();
      } else {
        meldeListenerAb();
      }

      if (wirdEingeblendet) {
        setzeText(kopierStatus, '');
        titel.focus();
      }
    },

    aktualisiere({ name, position, einladung }) {
      setzeText(nameAnzeige, name || 'Spieler');

      zeige(privatBlock, Boolean(einladung));

      if (einladung) {
        // Der eigene Seitenpfad bleibt erhalten; nur der Einladungscode kommt
        // dazu.
        feldLink.value = `${window.location.origin}${
          window.location.pathname
        }?spiel=${einladung}`;
        setzeText(positionAnzeige, 'Dein privates Spiel ist bereit.');
      } else if (typeof position === 'number') {
        setzeText(
          positionAnzeige,
          position === 1
            ? 'Du bist als Nächster an der Reihe.'
            : `Du bist auf Platz ${position} der Warteschlange.`,
        );
      } else {
        setzeText(positionAnzeige, '');
      }
    },

    melde(text) {
      setzeText(positionAnzeige, text);
    },
  };
}

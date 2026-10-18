/**
 * warten.js – Warteposition, privater Einladungslink und Wartezeit.
 * Die Suche und ihre Position kommen vom Server; Abbrechen ist sofort sichtbar.
 * Die Wartezeit ist nur Anzeige; die Frist prüft der Server.
 * Inhalt: == 1. Einrichtung · == 2. Aktionen · == 3. Wartezeit
 *         == 4. Ansicht
 * Benutzt von main.js; benutzt dom.js.
 */

import { $, zeige, setzeText } from './dom.js';

// EINSTELLBAR: So oft wird die angezeigte Wartezeit erneuert.
const UHR_TAKT_MS = 1000;

export function wartezeitText(sekunden) {
  const minuten = Math.floor(sekunden / 60);
  const rest = String(sekunden % 60).padStart(2, '0');
  return `${minuten}:${rest}`;
}

// == 1. Einrichtung ======================================================
export function erzeugeWarteAnsicht({ aktionen, beiAbbrechen }) {
  const abschnitt = $('#ansicht-warten');
  const titel = $('#t-warten');
  const nameAnzeige = $('#warten-name');
  const positionAnzeige = $('#warten-position');
  const fehlerAnzeige = $('#warten-fehler');
  const knopfAbbrechen = $('#knopf-abbrechen');
  const privatBlock = $('#warten-privat');
  const feldLink = $('#feld-link');
  const knopfKopieren = $('#knopf-kopieren');
  const kopierStatus = $('#kopier-status');
  const zeitAnzeige = $('#warten-zeit');

  let warteBeginn = 0;
  let uhr = null;

  // == 2. Aktionen =========================================================
  // Eigenes Feld: aktualisiere schreibt die Position bei jeder Änderung neu
  // und würde eine Meldung im selben Feld sofort überschreiben.
  function zeigeFehler(text) {
    setzeText(fehlerAnzeige, text);
    zeige(fehlerAnzeige, text !== '');
  }

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

  // == 3. Wartezeit =======================================================
  // Aus der vergangenen Zeit rechnen statt mitzählen: Hintergrund-Tabs
  // bremsen den Takt, die Anzeige stimmt beim Zurückkehren trotzdem.
  function zeichneWartezeit() {
    const vergangen = Math.floor((Date.now() - warteBeginn) / 1000);
    // Eine zurückgestellte Systemuhr ergibt keine negative Wartezeit.
    const sekunden = Math.max(0, vergangen);
    setzeText(zeitAnzeige, wartezeitText(sekunden));
    zeitAnzeige.setAttribute('datetime', `PT${sekunden}S`);
  }

  function starteUhr() {
    stoppeUhr();
    warteBeginn = Date.now();
    zeichneWartezeit();
    uhr = setInterval(zeichneWartezeit, UHR_TAKT_MS);
  }

  function stoppeUhr() {
    clearInterval(uhr);
    uhr = null;
  }

  // == 4. Ansicht ==========================================================
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
        stoppeUhr();
      }

      // Nur ein neues Warten startet die Uhr; Positionsupdates nicht.
      if (wirdEingeblendet) {
        setzeText(kopierStatus, '');
        zeigeFehler('');
        starteUhr();
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
      zeigeFehler(text);
    },
  };
}

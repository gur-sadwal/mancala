/**
 * Ansicht WARTEN – der Wartebildschirm (Konzept 8.1).
 *
 * Vom Dozenten ausdruecklich gefordert (Regelwerk 4.1, Folie 3): Der Spieler
 * muss sehen, dass gesucht wird, wie lange er schon wartet und wie er
 * abbrechen kann.
 *
 * Beim privaten Spiel steht hier statt der Warteposition der Einladungslink.
 */

import { $, zeige, setzeText } from './dom.js';

/**
 * Baut den Wartebildschirm auf.
 *
 * @param {object} deps
 * @param {object} deps.aktionen       Sendefunktionen
 * @param {Function} deps.beiAbbrechen wird nach "Suche abbrechen" gerufen
 * @returns {{zeige: Function, aktualisiere: Function, raeumeAuf: Function}}
 */
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

  /**
   * Klick auf "Suche abbrechen".
   *
   * Der Server schickt darauf keine Antwort – die Ansicht muss also selbst
   * zurueck zur Anmeldung wechseln. Das erledigt main.js ueber den Rueckruf.
   */
  function beiAbbrechenKlick() {
    aktionen.abbrechen();
    beiAbbrechen();
  }

  /**
   * Klick auf "Link kopieren".
   *
   * Der Link wird zuerst markiert: Klappt das Kopieren nicht, kann man ihn
   * so direkt selbst kopieren.
   */
  async function beiKopieren() {
    feldLink.select();

    try {
      await navigator.clipboard.writeText(feldLink.value);
      setzeText(kopierStatus, 'Link kopiert! Schicke ihn jetzt deinem Mitspieler.');
    } catch {
      // Die Zwischenablage erlauben Browser nur ueber https oder localhost.
      // Ueber http (z. B. im Hoersaal-Netz) landet man hier.
      setzeText(kopierStatus, 'Kopieren ging nicht. Der Link ist markiert – kopiere ihn mit Cmd+C bzw. Strg+C.');
    }
  }

  knopfAbbrechen.addEventListener('click', beiAbbrechenKlick);
  knopfKopieren.addEventListener('click', beiKopieren);

  return {
    zeige(sichtbar) {
      // Nur beim echten Einblenden fokussieren: main.js ruft zeige() bei jeder
      // Zustandsaenderung auf, und der Fokus soll nicht vom "Link kopieren"-
      // Knopf weggerissen werden.
      const wirdEingeblendet = sichtbar && abschnitt.hidden;

      zeige(abschnitt, sichtbar);

      if (wirdEingeblendet) {
        setzeText(kopierStatus, '');
        titel.focus();
      }
    },

    /**
     * Aktualisiert Name und Warteposition bzw. den Einladungslink.
     *
     * Die Position kommt bei jeder Aenderung der Warteschlange neu vom Server
     * und verhindert den Eindruck eines eingefrorenen Bildschirms
     * (Konzept 7.4).
     */
    aktualisiere({ name, position, einladung }) {
      setzeText(nameAnzeige, name || 'Spieler');

      zeige(privatBlock, Boolean(einladung));

      if (einladung) {
        // Derselbe Seitenpfad, nur mit dem Code dahinter.
        feldLink.value = `${window.location.origin}${window.location.pathname}?spiel=${einladung}`;
        setzeText(positionAnzeige, 'Dein privates Spiel ist bereit.');
      } else if (typeof position === 'number') {
        setzeText(
          positionAnzeige,
          position === 1
            ? 'Du bist als Naechster an der Reihe.'
            : `Du bist auf Platz ${position} der Warteschlange.`,
        );
      } else {
        setzeText(positionAnzeige, '');
      }
    },

    raeumeAuf() {
      knopfAbbrechen.removeEventListener('click', beiAbbrechenKlick);
      knopfKopieren.removeEventListener('click', beiKopieren);
    },
  };
}

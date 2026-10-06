/**
 * Ansicht ENDE – der Ergebnisdialog (Konzept 8.1).
 *
 * Umgesetzt als natives <dialog> mit showModal(): Fokusfalle, Esc-Taste und
 * der abdunkelnde Hintergrund kommen damit vom Browser und muessen nicht
 * nachgebaut werden (Konzept 8.8). Esc fuehrt zurueck zur Anmeldung.
 */

import { $, setzeText, zeige as zeigeElement, restSekunden } from './dom.js';
import { GRUND, GRENZEN } from '/shared/protokoll.js';

/** Schluessel, unter dem die Bilanz dieser Sitzung gemerkt wird. */
const SPEICHER_BILANZ = 'mancala.bilanz';

/**
 * Liest die Bilanz aus dem sessionStorage.
 *
 * sessionStorage statt localStorage: Die Bilanz gilt fuer diese Sitzung –
 * sie ueberlebt Neuladen, ist aber weg, sobald der Tab geschlossen wird.
 * Die Bilanz ist reine Anzeige; der Server kennt sie nicht und braucht sie
 * nicht.
 *
 * In try/catch aus demselben Grund wie in anmelden.js: Im privaten Modus
 * mancher Browser wirft der Speicherzugriff eine Ausnahme.
 */
function leseBilanz() {
  const leer = { siege: 0, niederlagen: 0, remis: 0 };

  try {
    const gespeichert = JSON.parse(window.sessionStorage.getItem(SPEICHER_BILANZ));
    return { ...leer, ...gespeichert };
  } catch {
    return leer;
  }
}

/** Schreibt die Bilanz zurueck – scheitert das, zaehlt sie eben nur bis zum Neuladen. */
function speichereBilanz(bilanz) {
  try {
    window.sessionStorage.setItem(SPEICHER_BILANZ, JSON.stringify(bilanz));
  } catch {
    // Kein Speicher verfuegbar: Die Bilanz bleibt trotzdem im Arbeitsspeicher.
  }
}

/**
 * Z. B. "Gursharan, dein Ergebnis: 3-1 | 0 Remis" – vorne Siege und
 * Niederlagen, hinter dem Strich die Remis.
 */
function bilanzText(name, { siege, niederlagen, remis }) {
  const anrede = name === '' ? 'Dein' : `${name}, dein`;
  return `${anrede} Ergebnis: ${siege}-${niederlagen} | ${remis} Remis`;
}

/** Revanche-Staende, in denen die Frist laeuft und der Zaehler tickt. */
const OFFENE_STAENDE = ['moeglich', 'gewuenscht', 'angeboten'];

/**
 * Satz unter den Knoepfen, je nach Stand der Revanche. Solange die Frist
 * laeuft, steht die Restzeit dabei.
 *
 * @param {null|string} stand  Revanche-Stand, siehe kern.js
 * @param {number} rest        verbleibende Sekunden
 */
function revancheText(stand, rest) {
  switch (stand) {
    case 'moeglich':
      return `Noch ${rest} s für eine Revanche.`;
    case 'gewuenscht':
      return `Warte, ob dein Gegner auch eine Revanche möchte … (noch ${rest} s)`;
    case 'angeboten':
      return `Dein Gegner möchte eine Revanche! (noch ${rest} s)`;
    case 'weg':
      return 'Dein Gegner ist nicht mehr da – eine Revanche geht nicht mehr.';
    case 'abgelaufen':
      return 'Die Zeit für eine Revanche ist abgelaufen.';
    default:
      return '';
  }
}

/**
 * Baut den Ergebnisdialog auf.
 *
 * @param {object} deps
 * @param {object} deps.aktionen      Sendefunktionen
 * @param {Function} deps.beiAbmelden wird beim Klick auf "Abmelden" gerufen
 * @param {Function} deps.beiRevanche wird beim Klick auf "Revanche" gerufen
 * @param {Function} deps.beiSchliessen wird gerufen, wenn der Dialog ohne
 *                                      Knopf zugeht (Esc-Taste)
 */
export function erzeugeEndeAnsicht({ aktionen, beiAbmelden, beiRevanche, beiSchliessen }) {
  const dialog = $('#dialog-ende');
  const titel = $('#t-ende');
  const grundAnzeige = $('#ende-grund');
  const punkteEigen = $('#ende-punkte-eigen');
  const punkteGegner = $('#ende-punkte-gegner');
  const text = $('#ende-text');
  const knopfErneut = $('#knopf-erneut');
  const knopfAbmelden = $('#knopf-abmelden');
  const bilanzAnzeige = $('#ende-bilanz');
  const knopfRevanche = $('#knopf-revanche');
  const revancheHinweis = $('#revanche-hinweis');

  /** Letzter Revanche-Stand aus main.js und Beginn seiner Frist (ms). */
  let aktuelleRevanche = null;
  let fristBeginn = 0;

  /** Kennung des Sekundentakts, solange der Zaehler laeuft – sonst null. */
  let zaehler = null;

  /** Bilanz dieser Sitzung: Siege, Niederlagen, Remis. */
  const bilanz = leseBilanz();

  /**
   * Das zuletzt gezaehlte Ergebnis.
   *
   * main.js ruft `zeige()` bei JEDER Zustandsaenderung erneut auf, solange die
   * Ansicht ENDE gilt – mit demselben Ergebnisobjekt. Ohne diesen Vergleich
   * wuerde eine Partie mehrfach gezaehlt.
   */
  let gezaehltesErgebnis = null;

  /**
   * Wie oft dieses Modul den Dialog selbst geschlossen hat, ohne dass das
   * `close`-Ereignis schon eingetroffen ist.
   *
   * Der Browser feuert `close` bei JEDEM Schliessen – auch bei unseren
   * eigenen Aufrufen, und zwar erst etwas spaeter. Ein Zaehler statt eines
   * true/false, damit zwei schnelle eigene Schliessungen sich nicht
   * gegenseitig aufheben.
   */
  let eigeneSchliessungen = 0;

  /** Haelt den Zaehler an. Mehrfach aufrufbar, auch wenn keiner laeuft. */
  function stoppeZaehler() {
    clearInterval(zaehler);
    zaehler = null;
  }

  /**
   * Zeichnet Revanche-Knopf und Hinweissatz – beim Oeffnen, bei jeder
   * Zustandsaenderung und einmal je Sekunde, solange die Frist laeuft.
   *
   * Der Zaehler ist reine ANZEIGE: Steht er auf 0, sperrt er den Knopf und
   * zeigt "abgelaufen". Verbindlich ist die Frist auf dem Server
   * (spiel:revanche-abgelaufen); der hat dafuer 2 s Kulanz, damit ein Klick
   * in der letzten Sekunde noch ankommt.
   */
  function zeichneRevanche() {
    const rest = restSekunden(fristBeginn, Date.now(), GRENZEN.REVANCHE_SEKUNDEN);
    const offen = OFFENE_STAENDE.includes(aktuelleRevanche);
    const fristLaeuft = offen && rest > 0;

    // Steht der Zaehler auf 0, gilt die Revanche in der Anzeige als abgelaufen.
    const stand = offen && rest === 0 ? 'abgelaufen' : aktuelleRevanche;

    // Knopf nur nach einem echten Spielende. Gesperrt, solange man selbst schon
    // wartet, der Gegner weg ist oder die Zeit um ist.
    zeigeElement(knopfRevanche, stand !== null);
    knopfRevanche.disabled = stand !== 'moeglich' && stand !== 'angeboten';
    setzeText(knopfRevanche, stand === 'angeboten' ? 'Revanche annehmen' : 'Revanche');

    const hinweis = revancheText(stand, rest);
    setzeText(revancheHinweis, hinweis);
    zeigeElement(revancheHinweis, hinweis !== '');

    // Den Sekundentakt nur laufen lassen, solange es etwas zu zaehlen gibt.
    if (!fristLaeuft) {
      stoppeZaehler();
    } else if (zaehler === null) {
      zaehler = setInterval(zeichneRevanche, 1000);
    }
  }

  /** Schliesst den Dialog und merkt sich, dass das Absicht war. */
  function schliesse() {
    stoppeZaehler();
    if (!dialog.open) return;
    eigeneSchliessungen += 1;
    dialog.close();
  }

  /**
   * `close`-Ereignis: Kam es nicht von uns, wurde Esc gedrueckt.
   *
   * Ohne diese Behandlung bliebe die Anzeige im Zustand ENDE haengen – der
   * Dialog waere weg, und man saehe nur noch das tote Brett ohne Knoepfe.
   */
  function beiClose() {
    if (eigeneSchliessungen > 0) {
      eigeneSchliessungen -= 1;
      return;
    }
    beiSchliessen();
  }

  /** "Neues Spiel suchen": Dialog schliessen und zurueck in die Warteschlange. */
  function beiErneut() {
    schliesse();
    aktionen.erneut();
  }

  /** "Abmelden": Dialog schliessen und zurueck zum Startbildschirm. */
  function beiAbmeldenKlick() {
    schliesse();
    beiAbmelden();
  }

  knopfErneut.addEventListener('click', beiErneut);
  knopfAbmelden.addEventListener('click', beiAbmeldenKlick);
  knopfRevanche.addEventListener('click', beiRevanche);
  dialog.addEventListener('close', beiClose);

  /**
   * Endete die Partie ohne echte Entscheidung?
   *
   * Bei einem internen Fehler oder einem Serverneustart hat niemand
   * gewonnen oder verloren. Solche Partien zaehlen nicht in der Bilanz und
   * bekommen die Ueberschrift "Partie abgebrochen".
   */
  function ohneWertung(grund) {
    return grund === GRUND.INTERNER_FEHLER || grund === GRUND.SERVER_ENDE;
  }

  /**
   * Erklaert in einem Satz, warum die Partie vorbei ist.
   */
  function grundText(grund) {
    switch (grund) {
      case GRUND.GEGNER_WEG:
        return 'Der Gegner hat das Spiel verlassen.';
      case GRUND.AUFGEGEBEN:
        return 'Die Partie wurde aufgegeben.';
      case GRUND.INTERNER_FEHLER:
        return 'Die Partie musste wegen eines Fehlers abgebrochen werden.';
      case GRUND.SERVER_ENDE:
        return 'Der Server wurde beendet.';
      default:
        return 'Eine Reihe ist leer – die restlichen Kugeln wurden verteilt.';
    }
  }

  return {
    /**
     * Zeigt das Ergebnis.
     *
     * @param {object} daten
     * @param {object} daten.ergebnis  { punkte, sieger, grund }
     * @param {'unten'|'oben'} daten.sitz
     * @param {null|string} daten.revanche  Revanche-Stand, siehe kern.js;
     *        null = keine Revanche moeglich (Abbruch), dann gibt es keinen Knopf
     * @param {number} daten.revancheSeit  Beginn der Revanche-Frist (ms)
     * @param {string} daten.name  eigener Spielername fuer die Bilanz
     */
    zeige({ ergebnis, sitz, revanche = null, revancheSeit = 0, name = '' }) {
      const gegnerSitz = sitz === 'unten' ? 'oben' : 'unten';

      const meine = ergebnis.punkte[sitz];
      const seine = ergebnis.punkte[gegnerSitz];

      // Jede Partie genau einmal zaehlen. Ein Abbruch ohne Wertung ist keine
      // echte Partie und zaehlt deshalb nicht.
      if (ergebnis !== gezaehltesErgebnis && !ohneWertung(ergebnis.grund)) {
        gezaehltesErgebnis = ergebnis;

        if (ergebnis.sieger === 'remis') {
          bilanz.remis += 1;
        } else if (ergebnis.sieger === sitz) {
          bilanz.siege += 1;
        } else {
          bilanz.niederlagen += 1;
        }
        speichereBilanz(bilanz);
      }
      setzeText(bilanzAnzeige, bilanzText(name, bilanz));

      setzeText(punkteEigen, meine);
      setzeText(punkteGegner, seine);
      setzeText(grundAnzeige, grundText(ergebnis.grund));

      if (ohneWertung(ergebnis.grund)) {
        setzeText(titel, 'Partie abgebrochen');
        setzeText(text, `Stand beim Abbruch: ${meine} zu ${seine}.`);
      } else if (ergebnis.sieger === 'remis') {
        setzeText(titel, 'Unentschieden');
        setzeText(text, `${meine} zu ${seine} – ein Remis.`);
      } else if (ergebnis.sieger === sitz) {
        setzeText(titel, 'Du hast gewonnen!');
        setzeText(text, `${meine} zu ${seine} – Glückwunsch.`);
      } else {
        setzeText(titel, 'Du hast verloren');
        setzeText(text, `${meine} zu ${seine} – beim nächsten Mal.`);
      }

      // Revanche-Knopf, Hinweissatz und Zaehler.
      aktuelleRevanche = revanche;
      fristBeginn = revancheSeit;
      zeichneRevanche();

      // showModal() statt show(): nur so gibt es Fokusfalle und Backdrop.
      // Fokus nur beim Oeffnen setzen – main.js ruft zeige() bei jeder
      // Zustandsaenderung erneut auf, und wer per Tab auf "Abmelden" steht,
      // soll nicht zurueckgerissen werden.
      if (!dialog.open) {
        dialog.showModal();
        // Immer "Neues Spiel suchen", auch wenn eine Revanche moeglich ist:
        // Ein Enter direkt nach dem letzten Zug soll nicht aus Versehen eine
        // Revanche anfragen.
        knopfErneut.focus();
      }
    },

    verstecke() {
      schliesse();
    },

    raeumeAuf() {
      stoppeZaehler();
      knopfErneut.removeEventListener('click', beiErneut);
      knopfAbmelden.removeEventListener('click', beiAbmeldenKlick);
      knopfRevanche.removeEventListener('click', beiRevanche);
      dialog.removeEventListener('close', beiClose);
    },
  };
}

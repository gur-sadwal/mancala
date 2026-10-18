/**
 * ende.js – Ergebnisdialog, lokale Bilanz und Revanche-Anzeige.
 * Die Wertung kommt vom Server; die Bilanz bleibt im Browser-Tab.
 * Inhalt: == 1. Bilanz · == 2. Texte · == 3. Dialog und Revanche
 * Benutzt von main.js; benutzt dom.js, kern.js und shared/protokoll.js.
 */

import { $, setzeText, zeige as zeigeElement, restSekunden } from './dom.js';
import { REVANCHE_STAND } from './kern.js';
import { GRUND, GRENZEN, REMIS } from '/shared/protokoll.js';

// == 1. Bilanz ===========================================================
const SPEICHER_BILANZ = 'mancala.bilanz';

// sessionStorage überlebt Neuladen; fehlender Speicher darf nicht blockieren.
function leseBilanz() {
  try {
    return bilanzAusSpeichertext(
      window.sessionStorage.getItem(SPEICHER_BILANZ),
    );
  } catch {
    return bilanzAusSpeichertext(null);
  }
}

// SCHUTZ: Gespeicherte Daten sind veränderbar; nur sichere ganze Zahlen ab 0
// übernehmen.
export function bilanzAusSpeichertext(text) {
  const bilanz = { siege: 0, niederlagen: 0, remis: 0 };

  let gespeichert;
  try {
    gespeichert = JSON.parse(text);
  } catch {
    return bilanz;
  }
  if (typeof gespeichert !== 'object' || gespeichert === null) return bilanz;

  for (const name of Object.keys(bilanz)) {
    const wert = gespeichert[name];
    if (Number.isSafeInteger(wert) && wert >= 0) bilanz[name] = wert;
  }
  return bilanz;
}

function speichereBilanz(bilanz) {
  try {
    window.sessionStorage.setItem(SPEICHER_BILANZ, JSON.stringify(bilanz));
  } catch {
    // Speichern ist optional; die Anzeige bleibt im Arbeitsspeicher erhalten.
  }
}

// == 2. Texte ============================================================
export function bilanzText(name, { siege, niederlagen, remis }) {
  const anrede = name === '' ? 'Dein' : `${name}, dein`;
  return `${anrede} Ergebnis: ${siege}-${niederlagen} | ${remis} Remis`;
}

const OFFENE_STAENDE = [
  REVANCHE_STAND.MOEGLICH, REVANCHE_STAND.GEWUENSCHT, REVANCHE_STAND.ANGEBOTEN,
];

export function revancheText(stand, rest) {
  switch (stand) {
    case REVANCHE_STAND.MOEGLICH:
      return `Noch ${rest} s für eine Revanche.`;
    case REVANCHE_STAND.GEWUENSCHT:
      return (
        `Warte, ob dein Gegner auch eine Revanche möchte … (noch ${rest} s)`
      );
    case REVANCHE_STAND.ANGEBOTEN:
      return `Dein Gegner möchte eine Revanche! (noch ${rest} s)`;
    case REVANCHE_STAND.WEG:
      return 'Dein Gegner ist nicht mehr da – eine Revanche geht nicht mehr.';
    case REVANCHE_STAND.ABGELAUFEN:
      return 'Die Zeit für eine Revanche ist abgelaufen.';
    default:
      return '';
  }
}

// Bei Fehler, Neustart oder Ruhefrist hat niemand gewonnen oder verloren.
export function ohneWertung(grund) {
  return grund === GRUND.INTERNER_FEHLER
    || grund === GRUND.SERVER_ENDE
    || grund === GRUND.ZU_LANGE_KEIN_ZUG;
}

// REGEL 3.5: Beim regulären Ende erklärt der Text die Endabrechnung, die der
// Server bereits durchgeführt hat.
export function grundText(grund, gewonnen) {
  switch (grund) {
    case GRUND.GEGNER_WEG:
      return 'Der Gegner hat das Spiel verlassen.';
    case GRUND.AUFGEGEBEN:
      return gewonnen ? 'Dein Gegner hat aufgegeben.' : 'Du hast aufgegeben.';
    case GRUND.INTERNER_FEHLER:
      return 'Die Partie musste wegen eines Fehlers abgebrochen werden.';
    case GRUND.SERVER_ENDE:
      return 'Der Server wurde beendet.';
    case GRUND.ZU_LANGE_KEIN_ZUG:
      return `${GRENZEN.PARTIE_RUHE_MINUTEN} Minuten lang kam kein Zug – `
        + 'die Partie wurde beendet und zählt nicht.';
    default:
      return 'Eine Reihe ist leer – die restlichen Kugeln wurden verteilt.';
  }
}

// == 3. Dialog und Revanche ===============================================
export function erzeugeEndeAnsicht({
  beiNeuemSpiel, beiAbmelden, beiRevanche, beiSchliessen,
}) {
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

  let aktuelleRevanche = null;
  let fristBeginn = 0;
  let fehlermeldung = '';
  let angezeigtesErgebnis = null;

  let zaehler = null;

  const bilanz = leseBilanz();

  // Bei geänderter Revanche reicht main.js dasselbe Ergebnisobjekt weiter.
  // Seine Referenz verhindert, dass Zeichnen die Bilanz erneut erhöht.
  let gezaehltesErgebnis = null;

  function stoppeZaehler() {
    clearInterval(zaehler);
    zaehler = null;
  }

  // Der Zähler ist nur Anzeige; der Server entscheidet, ob die Frist abgelaufen
  // ist.
  function zeichneRevanche() {
    const rest = restSekunden(
      fristBeginn, Date.now(), GRENZEN.REVANCHE_SEKUNDEN,
    );
    const offen = OFFENE_STAENDE.includes(aktuelleRevanche);
    const fristLaeuft = offen && rest > 0;

    const stand = offen && rest === 0
      ? REVANCHE_STAND.ABGELAUFEN : aktuelleRevanche;
    const istAngebot = stand === REVANCHE_STAND.ANGEBOTEN;
    const hatteFokus = document.activeElement === knopfRevanche;

    zeigeElement(knopfRevanche, stand !== null);
    knopfRevanche.disabled = stand !== REVANCHE_STAND.MOEGLICH && !istAngebot;
    setzeText(knopfRevanche, istAngebot ? 'Revanche annehmen' : 'Revanche');

    // WCAG: Ein gesperrter Knopf verliert den Tastaturfokus. Die Überschrift
    // fängt ihn auf; ein zweites Enter löst dort nichts aus.
    if (hatteFokus && knopfRevanche.disabled) titel.focus();

    // Eine Fehlermeldung bleibt auch beim nächsten Sekundentakt sichtbar.
    const hinweis = fehlermeldung || revancheText(stand, rest);
    setzeText(revancheHinweis, hinweis);
    zeigeElement(revancheHinweis, hinweis !== '');

    if (!fristLaeuft) {
      stoppeZaehler();
    } else if (zaehler === null) {
      zaehler = setInterval(zeichneRevanche, 1000);
    }
  }

  function schliesse() {
    stoppeZaehler();
    if (dialog.open) dialog.close();
  }

  function beiErneut() {
    schliesse();
    beiNeuemSpiel();
  }

  function beiAbmeldenKlick() {
    schliesse();
    beiAbmelden();
  }

  // cancel meldet Esc an main.js. close() löst kein cancel aus; das Schließen
  // vor einer neuen Suche darf nicht zusätzlich zur Anmeldung zurückführen.
  function meldeListenerAn() {
    knopfErneut.addEventListener('click', beiErneut);
    knopfAbmelden.addEventListener('click', beiAbmeldenKlick);
    knopfRevanche.addEventListener('click', beiRevanche);
    dialog.addEventListener('cancel', beiSchliessen);
  }

  function meldeListenerAb() {
    knopfErneut.removeEventListener('click', beiErneut);
    knopfAbmelden.removeEventListener('click', beiAbmeldenKlick);
    knopfRevanche.removeEventListener('click', beiRevanche);
    dialog.removeEventListener('cancel', beiSchliessen);
  }

  // Ein Abbruch ohne Wertung verändert auch bei ungleichem Stand keine Bilanz.
  function zaehleErgebnis(ergebnis, sitz) {
    if (ergebnis === gezaehltesErgebnis || ohneWertung(ergebnis.grund)) return;
    gezaehltesErgebnis = ergebnis;
    if (ergebnis.sieger === REMIS) bilanz.remis += 1;
    else if (ergebnis.sieger === sitz) bilanz.siege += 1;
    else bilanz.niederlagen += 1;
    speichereBilanz(bilanz);
  }

  function zeichneErgebnis(ergebnis, sitz, name) {
    const gegnerSitz = sitz === 'unten' ? 'oben' : 'unten';
    const meine = ergebnis.punkte[sitz];
    const seine = ergebnis.punkte[gegnerSitz];
    setzeText(bilanzAnzeige, bilanzText(name, bilanz));
    setzeText(punkteEigen, meine);
    setzeText(punkteGegner, seine);
    setzeText(
      grundAnzeige, grundText(ergebnis.grund, ergebnis.sieger === sitz),
    );
    if (ohneWertung(ergebnis.grund)) {
      setzeText(titel, 'Partie abgebrochen');
      setzeText(text, `Stand beim Abbruch: ${meine} zu ${seine}.`);
    } else if (ergebnis.sieger === REMIS) {
      setzeText(titel, 'Unentschieden');
      setzeText(text, `${meine} zu ${seine} – ein Remis.`);
    } else if (ergebnis.sieger === sitz) {
      setzeText(titel, 'Du hast gewonnen!');
      setzeText(text, `${meine} zu ${seine} – Glückwunsch.`);
    } else {
      setzeText(titel, 'Du hast verloren');
      setzeText(text, `${meine} zu ${seine} – viel Glück beim nächsten Mal.`);
    }
  }

  // WCAG: showModal übernimmt die Fokusbegrenzung. Fokus nur beim Öffnen
  // setzen.
  function oeffneDialog() {
    if (dialog.open) return;
    dialog.showModal();

    // Ein Enter nach dem letzten Zug soll keine Revanche auslösen.
    knopfErneut.focus();
  }

  function zeige({
    ergebnis, sitz, revanche = null, revancheSeit = 0, name = '',
  }) {
    if (ergebnis !== angezeigtesErgebnis || revanche !== aktuelleRevanche) {
      fehlermeldung = '';
    }
    angezeigtesErgebnis = ergebnis;
    meldeListenerAn();
    zaehleErgebnis(ergebnis, sitz);
    zeichneErgebnis(ergebnis, sitz, name);
    aktuelleRevanche = revanche;
    fristBeginn = revancheSeit;
    zeichneRevanche();
    oeffneDialog();
  }

  function verstecke() {
    schliesse();
    meldeListenerAb();
  }

  function melde(text) {
    fehlermeldung = text;
    zeichneRevanche();
  }

  return { zeige, verstecke, melde };
}

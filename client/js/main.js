/**
 * Einstiegspunkt des Clients (Konzept 8.2).
 *
 * Verdrahtet Netz, Anzeigezustand und Ansichten. Dies ist das einzige Modul,
 * das alle anderen kennt – alle uebrigen kennen jeweils nur ihre eigene
 * Aufgabe.
 *
 * Der Datenfluss ist eine Einbahnstrasse:
 *
 *     Socket  ->  Rueckruf  ->  store  ->  Ansicht
 *
 * Ein Klick geht den umgekehrten Weg, veraendert aber NIE direkt das Bild –
 * er schickt nur `spiel:zug`. Erst die Antwort des Servers zeichnet neu.
 * Damit kann die Anzeige nicht von der Serverwahrheit abweichen.
 */

import { $, zeige } from './dom.js';
import { erzeugeStore, ANSICHT, verbinde } from './kern.js';
import { erzeugeAnmeldeAnsicht } from './anmelden.js';
import { erzeugeWarteAnsicht } from './warten.js';
import { erzeugeSpielAnsicht } from './spiel.js';
import { erzeugeEndeAnsicht } from './ende.js';
import { erzeugeEinstellungen } from './einstellungen.js';
import { FEHLER, FEHLER_TEXT, STATUS } from '/shared/protokoll.js';

/*
 * Einstellungen ZUERST: Sie setzen z. B. die groessere Schrift. Je frueher das
 * passiert, desto kuerzer sieht man die Seite in der falschen Groesse.
 */
const einstellungen = erzeugeEinstellungen();

const store = erzeugeStore();
const verbindungshinweis = $('#verbindungshinweis');

/**
 * Haelt die zuletzt gestartete Zug-Animation fest.
 *
 * Der Server sendet bei einem Partieende zwei Nachrichten kurz hintereinander:
 * erst `spiel:stand` (mit dem letzten Zug), dann `spiel:ende`. Ohne dieses
 * Warten wuerde der Ergebnisdialog ueber der noch laufenden Animation
 * aufspringen.
 */
let letzteAnimation = Promise.resolve();

/**
 * Ist die aktuelle Partie auf dem Server schon vorbei?
 *
 * Der Server loescht eine Partie sofort, der Client zeigt das Ergebnis aber
 * erst nach der letzten Animation. Ein Klick in dieser Luecke (etwa auf
 * "Partie aufgeben") wird mit KEINE_PARTIE beantwortet – diese Antwort darf
 * den Weg zum Ergebnisdialog dann nicht mehr abschneiden.
 */
let partieVorbei = false;

/**
 * Gab es schon einmal eine Verbindung?
 *
 * Socket.io meldet `connect` beim ersten Verbinden UND nach jedem
 * automatischen Wiederverbinden. Nur im zweiten Fall ist etwas verloren.
 */
let warSchonVerbunden = false;

// ---------------------------------------------------------------------------
// Netzwerk
// ---------------------------------------------------------------------------

/*
 * Die Rueckrufe greifen weiter unten auf `spielAnsicht` und `anmeldeAnsicht`
 * zu, die erst NACH diesem Aufruf entstehen. Das ist Absicht und kein
 * Versehen: Die Ansichten brauchen `aktionen`, `aktionen` braucht die
 * Rueckrufe – eine der beiden Seiten muss spaeter kommen. Aufgerufen werden
 * die Rueckrufe ausschliesslich durch eintreffende Socket-Ereignisse, also
 * lange nachdem dieses Modul fertig ausgewertet ist.
 */
const aktionen = verbinde({
  /**
   * Verbindung steht – zum ersten Mal oder nach einem Abbruch.
   *
   * Nach einem Abbruch hat der Browser eine NEUE Socket-Kennung. Fuer den
   * Server ist das ein Fremder: Warteplatz und Partie der alten Verbindung
   * sind weg. Wer gerade wartete oder spielte, muss deshalb neu beitreten,
   * sonst sitzt er vor einem Bildschirm, der nie mehr weitergeht.
   */
  beiVerbindung() {
    const { ansicht } = store.lies();
    const hingAmServer = ansicht === ANSICHT.WARTEN || ansicht === ANSICHT.SPIEL;

    store.setze({ verbunden: true });
    zeige(verbindungshinweis, false);

    if (warSchonVerbunden && hingAmServer) {
      store.setze({
        ansicht: ANSICHT.ANMELDEN,
        spielstand: null,
        sitz: null,
        position: null,
        einladung: null,
      });
      // Erst NACH dem Ansichtswechsel melden: Beim Einblenden leert die
      // Anmeldeansicht ihre Fehlermeldung.
      anmeldeAnsicht.melde('Die Verbindung war unterbrochen. Bitte tritt erneut bei.');
    }

    warSchonVerbunden = true;
  },

  beiTrennung() {
    store.setze({ verbunden: false });
    zeige(verbindungshinweis, true);
  },

  beiWarteschlange({ position }) {
    store.setze({ ansicht: ANSICHT.WARTEN, position, einladung: null });
  },

  /** Privates Spiel ist angelegt: Wartebildschirm mit Einladungslink. */
  beiPrivat({ code }) {
    store.setze({ ansicht: ANSICHT.WARTEN, einladung: code, position: null });
  },

  beiStart({ sitz, gegner, spielstand }) {
    // Ein Einladungslink ist jetzt verbraucht. Aus der Adresszeile nehmen,
    // damit Neuladen nicht versucht, demselben Spiel noch einmal beizutreten.
    entferneEinladungAusAdresse();
    partieVorbei = false;

    store.setze({
      ansicht: ANSICHT.SPIEL,
      sitz,
      gegnerName: gegner.name,
      spielstand,
      ergebnis: null,
      position: null,
      einladung: null,
      revanche: null,
    });

    spielAnsicht.starte(spielstand, sitz);
  },

  beiStand({ spielstand, bericht }) {
    if (spielstand.status !== STATUS.LAEUFT) partieVorbei = true;
    store.setze({ spielstand });
    letzteAnimation = spielAnsicht.spieleZug(bericht, spielstand);
  },

  async beiEnde({ spielstand, ergebnis, revanche }) {
    // Die Revanche-Frist zaehlt ab JETZT, nicht erst nach der Animation – so
    // passt der Zaehler im Dialog zur Frist auf dem Server.
    const revancheSeit = Date.now();

    // Erst die Animation des letzten Zuges zu Ende laufen lassen.
    await letzteAnimation;
    store.setze({
      ansicht: ANSICHT.ENDE,
      spielstand,
      ergebnis,
      revanche: revancheStand(revanche),
      revancheSeit,
    });
  },

  /**
   * Abbruch: Gegner weg, Aufgabe oder interner Fehler (Konzept 6.6).
   *
   * Die Partie ist vorbei, der Prozess auf dem Server laeuft weiter – der
   * Spieler bekommt einen Dialog und kann sofort neu suchen.
   */
  async beiAbbruch({ grund, ergebnis, spielstand, revanche }) {
    partieVorbei = true;
    const revancheSeit = Date.now();   // Start der Revanche-Frist, siehe beiEnde
    await letzteAnimation;

    store.setze({
      ansicht: ANSICHT.ENDE,
      spielstand: spielstand ?? store.lies().spielstand,
      ergebnis: ergebnis ?? { punkte: { unten: 0, oben: 0 }, sieger: 'remis', grund },
      revanche: revancheStand(revanche),
      revancheSeit,
    });
  },

  /**
   * Der Gegner moechte eine Revanche.
   *
   * Wer selbst schon "Revanche" gedrueckt hat, bleibt bei "gewuenscht": Die
   * Partie startet dann ohnehin gleich.
   */
  beiRevancheAngebot() {
    if (store.lies().revanche !== 'gewuenscht') {
      store.setze({ revanche: 'angeboten' });
    }
  },

  /** Revanche geht nicht mehr – der Gegner ist weg oder spielt etwas anderes. */
  beiRevancheWeg() {
    if (store.lies().revanche !== null) {
      store.setze({ revanche: 'weg' });
    }
  },

  /**
   * Die Frist fuer die Revanche ist vorbei – das sagt der Server. Der Zaehler
   * im Dialog ist nur die Anzeige dazu.
   */
  beiRevancheAbgelaufen() {
    if (store.lies().revanche !== null) {
      store.setze({ revanche: 'abgelaufen' });
    }
  },

  /**
   * Fehlermeldungen des Servers (Konzept 6.7).
   *
   * Sie gehen ausschliesslich an den Verursacher. Je nach Code wird still
   * ignoriert, kurz an der Mulde abgelehnt oder im Formular gemeldet.
   */
  beiFehler({ code, text }) {
    const meldung = text ?? FEHLER_TEXT[code] ?? 'Unbekannter Fehler.';
    const zustand = store.lies();

    switch (code) {
      case FEHLER.NUTZDATEN_UNGUELTIG:
      case FEHLER.MULDE_UNGUELTIG:
        // Kann nur durch einen Programmierfehler im Client entstehen: still
        // ignorieren, aber protokollieren.
        console.error('Der Server hat eine Nachricht abgelehnt:', code);
        break;

      case FEHLER.KEINE_PARTIE:
        // Partie gerade regulaer beendet oder abgebrochen: Das Ergebnis ist
        // unterwegs, diese Antwort auf einen spaeten Klick wird ignoriert.
        if (partieVorbei) break;
        store.setze({ ansicht: ANSICHT.ANMELDEN, spielstand: null, sitz: null });
        break;

      case FEHLER.BEREITS_IN_WARTESCHLANGE:
        store.setze({ ansicht: ANSICHT.WARTEN });
        break;

      case FEHLER.CODE_UNBEKANNT:
        // Der Link ist alt oder falsch: Code aus der Adresse nehmen, damit das
        // Formular wieder die normale Auswahl zeigt – und dazu die Meldung.
        entferneEinladungAusAdresse();
        anmeldeAnsicht.zeige(true);
        anmeldeAnsicht.melde(meldung);
        break;

      default:
        if (zustand.ansicht === ANSICHT.SPIEL) {
          spielAnsicht.melde(code);
        } else {
          anmeldeAnsicht.melde(meldung);
        }
    }
  },
});

// ---------------------------------------------------------------------------
// Ansichten
// ---------------------------------------------------------------------------

const anmeldeAnsicht = erzeugeAnmeldeAnsicht({ aktionen });

const warteAnsicht = erzeugeWarteAnsicht({
  aktionen,
  beiAbbrechen() {
    // Der Server antwortet auf das Abbrechen nicht – also selbst zurueck.
    store.setze({ ansicht: ANSICHT.ANMELDEN, position: null, einladung: null });
  },
});
const spielAnsicht = erzeugeSpielAnsicht({ aktionen });

/**
 * Revanche-Stand, sobald das Ergebnis da ist.
 *
 * Das Angebot des Gegners kann schneller ankommen als das eigene Ergebnis,
 * weil hier erst die letzte Animation abgewartet wird. Ein schon
 * eingetroffenes Angebot darf deshalb nicht ueberschrieben werden.
 *
 * @param {boolean} moeglich  vom Server: echtes Ende und beide noch verbunden?
 */
function revancheStand(moeglich) {
  if (!moeglich) return null;
  return store.lies().revanche === 'angeboten' ? 'angeboten' : 'moeglich';
}

const endeAnsicht = erzeugeEndeAnsicht({
  aktionen,

  /** "Revanche": Wunsch an den Server – der Dialog bleibt offen, bis beide wollen. */
  beiRevanche() {
    aktionen.revanche();
    store.setze({ revanche: 'gewuenscht' });
  },

  beiAbmelden() {
    // Zurueck zum Start: Verbindung trennen und gleich neu aufbauen, damit
    // der Server den alten Socket sauber aufraeumt.
    aktionen.trennen();
    store.setze({
      ansicht: ANSICHT.ANMELDEN,
      spielstand: null,
      sitz: null,
      ergebnis: null,
    });
    aktionen.neuVerbinden();
  },

  /**
   * Dialog ohne Knopf geschlossen (Esc-Taste).
   *
   * Die Partie ist auf dem Server bereits aufgeloest; ohne diesen Rueckruf
   * bliebe nur das tote Brett stehen. Also zurueck zur Anmeldung – die
   * Verbindung bleibt dabei bestehen.
   */
  beiSchliessen() {
    // Dem Server sagen: Ich warte auf nichts mehr – auch auf keine Revanche.
    // Sonst wartete der Gegner umsonst.
    aktionen.abbrechen();

    store.setze({
      ansicht: ANSICHT.ANMELDEN,
      spielstand: null,
      sitz: null,
      ergebnis: null,
      revanche: null,
    });
  },
});

/**
 * Der einzige Ort, an dem Ansichten ein- und ausgeblendet werden.
 *
 * Gewechselt wird ueber das `hidden`-Attribut, nicht durch Neuladen
 * (Konzept 8.1). Waehrend des Ergebnisdialogs bleibt das Brett sichtbar –
 * der Dialog liegt darueber.
 */
store.abonniere((zustand) => {
  const { ansicht } = zustand;

  anmeldeAnsicht.zeige(ansicht === ANSICHT.ANMELDEN);
  warteAnsicht.zeige(ansicht === ANSICHT.WARTEN);
  spielAnsicht.zeige(ansicht === ANSICHT.SPIEL || ansicht === ANSICHT.ENDE);

  if (ansicht === ANSICHT.WARTEN) {
    warteAnsicht.aktualisiere({
      name: zustand.name,
      position: zustand.position,
      einladung: zustand.einladung,
    });
  }

  if (ansicht === ANSICHT.ENDE && zustand.ergebnis && zustand.sitz) {
    endeAnsicht.zeige({
      ergebnis: zustand.ergebnis,
      sitz: zustand.sitz,
      revanche: zustand.revanche,
      revancheSeit: zustand.revancheSeit,
      name: eigenerName(zustand),
    });
  } else {
    endeAnsicht.verstecke();
  }
});

/**
 * Der eigene Name fuer die Bilanz im Ergebnisdialog.
 *
 * Bevorzugt die Fassung aus dem Spielstand: So, wie der Server den Namen
 * bereinigt hat, steht er auch auf dem Brett. Nur falls der Spielstand fehlt,
 * gilt der eingegebene Name.
 */
function eigenerName(zustand) {
  const spieler = zustand.spielstand?.spieler[zustand.sitz];
  return spieler ? spieler.name : zustand.name;
}

/**
 * Den eingegebenen Namen im Zustand festhalten.
 *
 * Er wird nur fuer die Anzeige auf dem Wartebildschirm gebraucht; die
 * verbindliche Fassung (bereinigt und gekuerzt) fuehrt der Server.
 */
$('#form-anmelden').addEventListener('submit', () => {
  store.setze({ name: $('#feld-name').value.trim() });
});

/**
 * Entfernt `?spiel=...` aus der Adresszeile, ohne die Seite neu zu laden.
 *
 * `replaceState` statt `pushState`: Der Zurueck-Knopf des Browsers soll nicht
 * wieder beim alten Einladungslink landen.
 */
function entferneEinladungAusAdresse() {
  window.history.replaceState(null, '', window.location.pathname);
}

// Startansicht setzen und damit den ersten Zeichendurchlauf ausloesen.
store.setze({ ansicht: ANSICHT.ANMELDEN });

// Beim ersten Besuch die Einstellungen anbieten – danach nie wieder von selbst.
einstellungen.zeigeBeimErstenBesuch();

/*
 * Ladehinweis ausblenden – bewusst als LETZTE Zeile der Einrichtung.
 * Ist bis hierhin irgendetwas gescheitert (Skript fehlt, Element fehlt,
 * Socket.io nicht geladen), wird diese Zeile nie erreicht und der Hinweis
 * "Bitte neu laden" bleibt sichtbar. So braucht es fuer Ladefehler keinen
 * eigenen Fehlercode.
 */
zeige($('#ladehinweis'), false);

/**
 * Aufraeumen beim Verlassen der Seite.
 *
 * Alle Ansichten melden ihre Listener ab. Auf einer Seite, die ohnehin
 * entladen wird, ist das nicht zwingend – es ist aber die Stelle, an der im
 * Review sichtbar wird, dass jeder Listener einen Gegenpart hat
 * (Anforderungen 6.3: Memory Leaks vermeiden).
 */
window.addEventListener('pagehide', () => {
  anmeldeAnsicht.raeumeAuf();
  warteAnsicht.raeumeAuf();
  spielAnsicht.raeumeAuf();
  endeAnsicht.raeumeAuf();
  einstellungen.raeumeAuf();
});

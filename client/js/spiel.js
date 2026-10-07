/**
 * Ansicht SPIEL – alles, was das Brett betrifft (Konzept 8.1, 8.3, 8.4).
 *
 * Diese Datei enthaelt die gesamte Spielansicht in fuenf Abschnitten, von
 * innen nach aussen gelesen:
 *
 *   1. Sicht       reine Geometrie: Drehung fuer den Sitz `oben`
 *   2. Aufbau      erzeugt die 14 Zellen einmalig
 *   3. Zeichnen    uebertraegt einen Spielstand auf vorhandene Zellen
 *   4. Animation   spielt den Zugbericht des Servers ab
 *   5. Ansicht     nimmt Klicks an, stoesst Animationen an
 *
 * Die Regeln kennt keiner dieser Abschnitte. Es wird nur eine Muldennummer
 * geschickt und gezeichnet, was der Server zurueckmeldet.
 *
 * Nach aussen gehen genau zwei Dinge: `erzeugeSpielAnsicht` fuer main.js und
 * die vier Geometriefunktionen aus Abschnitt 1, die tests/sicht.test.js
 * einzeln prueft. Alles andere ist dateiintern – und deshalb importiert diese
 * Datei ausser dom.js nichts: dom.js kommt ohne eigene Imports aus und bleibt
 * damit unter Node ladbar, was die Geometrie testbar haelt.
 */

import {
  $,
  erzeuge,
  zeige,
  schalte,
  setzeText,
  warte,
  wenigerBewegung,
} from './dom.js';

// ===========================================================================
// 1. Sicht
// ===========================================================================

/**
 * Sichttransformation: der Gegner sitzt gegenueber (Konzept 4.6).
 *
 * Der Server verschickt immer das KANONISCHE Brett. Jeder Client entscheidet
 * selbst, wie er es zeichnet: Fuer den Sitz `unten` unveraendert, fuer den
 * Sitz `oben` um 180 Grad gedreht.
 *
 * Damit gilt fuer beide Spieler: eigene Reihe unten, eigenes Haus rechts,
 * Laufrichtung optisch nach rechts. Es ist dieselbe Drehung, die zwei
 * Menschen an einem echten Brett erleben, wenn sie sich gegenuebersitzen.
 *
 * KONSEQUENZ (Entscheidung E-2): Ein Zug wird mit EINEM emit an den Raum
 * verschickt, nicht mit zwei personalisierten Nachrichten. Die Drehung kostet
 * auf dem Client eine Subtraktion pro Zelle.
 */

/**
 * Rechnet eine kanonische Zelle in eine Anzeigezelle um.
 *
 * Kontrolle fuer den Sitz `oben`:
 *
 *   kanonisch | Bedeutung          | gedreht | Anzeige
 *   [0,0]     | eigenes Haus       | [1,6]   | unten rechts
 *   [0,6]     | eigene Mulde 0     | [1,0]   | unten links
 *   [0,1]     | eigene Mulde 5     | [1,5]   | unten rechts neben dem Haus
 *   [1,6]     | gegnerisches Haus  | [0,0]   | oben links
 *
 * @param {'unten'|'oben'} sitz
 * @param {number[]} zelle  kanonische Zelle [reihe, spalte]
 * @returns {number[]} Anzeigezelle
 */
export function ausSicht(sitz, [reihe, spalte]) {
  return sitz === 'unten' ? [reihe, spalte] : [1 - reihe, 6 - spalte];
}

/**
 * Beschreibt, was eine Zelle fuer DIESEN Spieler bedeutet.
 *
 * Nach der Drehung sieht die Anzeige immer aus wie fuer den Sitz `unten`:
 *
 *   [1,6]        eigenes Haus
 *   [1,0]..[1,5] eigene Mulden 0 bis 5
 *   [0,0]        gegnerisches Haus
 *   [0,1]..[0,6] gegnerische Mulden – aus GEGNERSICHT die Nummern 5 bis 0
 *
 * Genau deshalb braucht der Client keine eigene Kopie der Sitztabelle aus
 * `server/spiel/brett.js`: Die Drehung erledigt die Fallunterscheidung.
 *
 * @returns {{art: 'haus'|'mulde', seite: 'eigen'|'gegner', pos: number|null}}
 */
export function rolleVon(sitz, zelle) {
  const [reihe, spalte] = ausSicht(sitz, zelle);

  if (reihe === 1) {
    return spalte === 6
      ? { art: 'haus', seite: 'eigen', pos: null }
      : { art: 'mulde', seite: 'eigen', pos: spalte };
  }

  // Reihe 0 ist die Gegenseite.
  return spalte === 0
    ? { art: 'haus', seite: 'gegner', pos: null }
    // Die gegnerische Mulde ganz rechts ([0,6]) ist am weitesten von seinem
    // Haus entfernt, aus seiner Sicht also seine Mulde 0.
    : { art: 'mulde', seite: 'gegner', pos: 6 - spalte };
}

/**
 * Eindeutiger Schluessel einer Zelle – dient als Kennung im DOM.
 *
 * Bewusst die KANONISCHE Zelle, nicht die gedrehte: Damit passen die Zellen
 * aus dem Zugbericht des Servers ohne Umrechnung auf die Elemente.
 */
export function schluessel([reihe, spalte]) {
  return `${reihe}-${spalte}`;
}

/** Alle 14 kanonischen Zellen in fester Reihenfolge. */
export function alleZellen() {
  const zellen = [];
  for (let reihe = 0; reihe < 2; reihe += 1) {
    for (let spalte = 0; spalte < 7; spalte += 1) {
      zellen.push([reihe, spalte]);
    }
  }
  return zellen;
}
// ===========================================================================
// 2. Aufbau
// ===========================================================================

/**
 * Einmaliger Aufbau der 14 Brettzellen (Konzept 8.3).
 *
 * Das Brett wird EINMAL aufgebaut; danach werden nur noch Zahlen und
 * Zustandsklassen aktualisiert – kein innerHTML, kein Neuaufbau. Das erhaelt
 * den Tastaturfokus und vermeidet Flackern.
 *
 * Dieser Abschnitt kennt den Netzwerkzustand nicht. Er bekommt einen Sitz und
 * liefert eine Zuordnung "kanonische Zelle -> DOM-Element".
 */

/** Hoechstzahl an Kugeln, die noch als einzelne Punkte gezeichnet werden. */
const PUNKTE_BIS = 8;

/**
 * Die 14 Zellen in der Reihenfolge, in der sie im DOM stehen sollen.
 *
 * Notiert in ANZEIGEKOORDINATEN, also so, wie das Brett auf dem Bildschirm
 * liegt – fuer beide Sitze gleich: eigene Reihe unten, eigenes Haus rechts.
 * Welche kanonische Zelle des Servers dahintersteckt, entscheidet erst die
 * Drehung in `baueBrett`.
 *
 *   [0,0]              Haus des Gegners (links)
 *   [0,1] .. [0,6]     gegnerische Mulden, von links nach rechts
 *   [1,0] .. [1,5]     eigene Mulden 0 bis 5, von links nach rechts
 *   [1,6]              eigenes Haus (rechts)
 *
 * Diese Reihenfolge ist zugleich die Tabulatorreihenfolge – sie bleibt beim Umschalten zwischen Hoch- und
 * Querformat unveraendert, weil nur das CSS-Raster umschaltet (Konzept 8.9).
 */
const ANZEIGE_REIHENFOLGE = [
  [0, 0],
  [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6],
  [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5],
  [1, 6],
];

/**
 * Baut das Brett in den uebergebenen Container.
 *
 * DOM-Reihenfolge (wichtig fuer die Tabulatortaste):
 *   1. gegnerisches Haus
 *   2. gegnerische Mulden, in Bildschirmreihenfolge von links nach rechts
 *   3. eigene Mulden 0 bis 5
 *   4. eigenes Haus
 *
 * Die optische Platzierung uebernimmt das CSS-Raster; die DOM-Reihenfolge
 * bleibt beim Umschalten zwischen Hoch- und Querformat unveraendert
 * (Konzept 8.9).
 *
 * @param {HTMLElement} container  das <ol id="brett">
 * @param {'unten'|'oben'} sitz
 * @returns {Map<string, HTMLElement>} kanonischer Zellenschluessel -> <li>
 */
function baueBrett(container, sitz) {
  container.replaceChildren();

  const zellen = new Map();

  for (const anzeigeZelle of ANZEIGE_REIHENFOLGE) {
    // Von der Anzeigeposition zurueck zur kanonischen Zelle.
    //
    // Dafuer wird dieselbe Funktion benutzt wie fuer den Hinweg: Eine Drehung
    // um 180 Grad ist ihre eigene Umkehrung – zweimal gedreht ergibt 360 Grad
    // und damit wieder den Ausgangspunkt. Fuer den Sitz `unten` passiert
    // ohnehin nichts.
    const zelle = ausSicht(sitz, anzeigeZelle);
    const rolle = rolleVon(sitz, zelle);

    const element = erzeugeZelle(zelle, rolle);
    zellen.set(schluessel(zelle), element);
    container.append(element);
  }

  return zellen;
}

/**
 * Erzeugt eine einzelne Zelle.
 *
 * Eigene Mulden werden zu echten <button>-Elementen, alles andere zu <div>:
 * So funktionieren Tastaturbedienung und Fokus ohne eigenes Zutun, und eine
 * gegnerische Mulde ist gar nicht erst ansteuerbar (Konzept 8.7).
 */
function erzeugeZelle(zelle, rolle) {
  const istEigeneMulde = rolle.art === 'mulde' && rolle.seite === 'eigen';

  const li = erzeuge('li', {
    klassen: ['zelle', `zelle--${rolle.art}-${rolle.seite}`],
    attribute: {
      'data-zelle': schluessel(zelle),
      ...(rolle.pos !== null ? { 'data-pos': rolle.pos } : {}),
    },
  });

  li.append(rolle.art === 'haus'
    ? erzeugeHaus(rolle)
    : erzeugeMulde(rolle, istEigeneMulde));

  return li;
}

/** Das Haus: grosse Zahl plus Beschriftung. */
function erzeugeHaus(rolle) {
  const eigen = rolle.seite === 'eigen';

  return erzeuge('div', { klassen: ['haus'] }, [
    erzeuge('span', { klassen: ['haus__zahl'], text: '0' }),
    erzeuge('span', {
      klassen: ['haus__beschriftung'],
      text: eigen ? 'Dein Haus' : 'Gegner',
    }),
  ]);
}

/**
 * Eine Mulde – als Button, wenn sie mir gehoert.
 *
 * `data-mulde` traegt die Muldennummer, die spaeter an den Server geht. Der
 * Klick wird ueber EINEN Listener auf dem Brett verarbeitet (Delegation),
 * nicht ueber 6 einzelne – so gibt es beim Ansichtswechsel auch nur einen
 * Listener zu entfernen (Konzept 8.7).
 */
function erzeugeMulde(rolle, alsButton) {
  const tag = alsButton ? 'button' : 'div';

  // Eine gegnerische Mulde ist kein Bedienelement und braucht keine Attribute.
  const attribute = alsButton ? { type: 'button', 'data-mulde': rolle.pos } : {};

  const kinder = [
    erzeuge('span', { klassen: ['kugeln'] }),
    erzeuge('span', { klassen: ['mulde__zahl'], text: '0' }),
  ];

  // Tastaturhilfe: Die eigene Mulde zeigt, welche Taste (1 bis 6) sie spielt.
  // Nur auf Handys blendet das CSS die Plakette aus (css/07-zustaende.css).
  if (alsButton) {
    kinder.push(erzeuge('span', { klassen: ['mulde__taste'], text: rolle.pos + 1 }));
  }

  return erzeuge(tag, {
    klassen: ['mulde', alsButton ? 'mulde--eigen' : 'mulde--gegnerisch'],
    attribute,
  }, kinder);
}

/**
 * Passt die Zahl der gezeichneten Kugelpunkte an.
 *
 * Es werden nur Punkte hinzugefuegt oder entfernt, nie alle neu erzeugt – das
 * haelt die Animation ruhig.
 */
function setzeKugelpunkte(kugelnContainer, anzahl) {
  const sichtbar = Math.min(anzahl, PUNKTE_BIS);
  const vorhanden = kugelnContainer.childElementCount;

  for (let i = vorhanden; i < sichtbar; i += 1) {
    kugelnContainer.append(erzeuge('span', { klassen: ['kugel'] }));
  }
  for (let i = vorhanden; i > sichtbar; i -= 1) {
    kugelnContainer.lastElementChild?.remove();
  }
}
// ===========================================================================
// 3. Zeichnen
// ===========================================================================

/**
 * Uebertraegt einen Spielstand auf die vorhandenen Zellen (Konzept 8.2).
 *
 * Dieser Abschnitt kennt keine Animation und kein Socket.io. Er bekommt ein
 * Brett und setzt Zahlen und Zustandsklassen – und zwar so, dass der Aufruf
 * beliebig oft wiederholt werden darf (Idempotenz). Genau das macht die
 * Animation ungefaehrlich: Am Ende wird immer der Serverzustand gezeichnet,
 * selbst wenn eine Animation abbricht (Konzept 8.4).
 */

/**
 * Zeichnet das gesamte Brett.
 *
 * @param {Map<string, HTMLElement>} zellen  aus baueBrett()
 * @param {number[][]} brett                 kanonisches Brett vom Server
 * @param {'unten'|'oben'} sitz
 * @param {boolean} ichBinDran
 */
function zeichneBrett(zellen, brett, sitz, ichBinDran) {
  for (const zelle of alleZellen()) {
    const element = zellen.get(schluessel(zelle));
    if (!element) continue;

    const anzahl = brett[zelle[0]][zelle[1]];
    const rolle = rolleVon(sitz, zelle);

    if (rolle.art === 'haus') {
      zeichneHaus(element, anzahl);
    } else {
      zeichneMulde(element, anzahl, rolle, ichBinDran);
    }
  }
}

/** Haus: nur die Zahl. */
function zeichneHaus(element, anzahl) {
  const zahl = element.querySelector('.haus__zahl');
  if (zahl) setzeText(zahl, anzahl);
}

/**
 * Mulde: Punkte, Zahl und Zustand.
 *
 * Der Zustand einer eigenen Mulde (Konzept 8.3):
 *   spielbar  ich bin am Zug und die Mulde enthaelt mindestens eine Kugel
 *   gesperrt  sonst – als `disabled`, damit die Tabulatortaste sie ueberspringt
 */
function zeichneMulde(element, anzahl, rolle, ichBinDran) {
  const mulde = element.querySelector('.mulde');
  if (!mulde) return;

  const kugeln = mulde.querySelector('.kugeln');
  const zahl = mulde.querySelector('.mulde__zahl');

  if (kugeln) setzeKugelpunkte(kugeln, anzahl);
  if (zahl) setzeText(zahl, anzahl);

  schalte(mulde, 'mulde--leer', anzahl === 0);
  schalte(mulde, 'mulde--viele', anzahl > PUNKTE_BIS);

  // Gegnerische Mulden sind nie bedienbar – fuer sie ist hier Schluss.
  if (rolle.seite !== 'eigen') return;

  const spielbar = ichBinDran && anzahl > 0;

  schalte(mulde, 'mulde--spielbar', spielbar);
  schalte(mulde, 'mulde--gesperrt', !spielbar);

  // `disabled` statt nur einer Klasse: Ein gesperrter Button ist auch fuer
  // die Tastatur tatsaechlich nicht bedienbar.
  mulde.disabled = !spielbar;
}

/**
 * Aktualisiert die Punktestandsleiste und die Zuganzeige.
 *
 * @param {object} elemente  gebuendelte DOM-Bezuege aus der Spielansicht
 * @param {object} spielstand
 * @param {'unten'|'oben'} sitz
 */
function zeichneStand(elemente, spielstand, sitz) {
  const gegnerSitz = sitz === 'unten' ? 'oben' : 'unten';
  const ichBinDran = spielstand.amZug === sitz;

  // Die Haeuser liegen kanonisch: unten [1,6], oben [0,0].
  const punkte = {
    unten: spielstand.brett[1][6],
    oben: spielstand.brett[0][0],
  };

  setzeText(elemente.punkteEigen, punkte[sitz]);
  setzeText(elemente.punkteGegner, punkte[gegnerSitz]);

  // Heissen beide gleich (z. B. zweimal "Anna"), steht beim eigenen Stand
  // "Du" – sonst waeren die zwei Punktestaende nicht auseinanderzuhalten.
  // Wer wer ist, entscheidet ohnehin die Socket-Kennung, nicht der Name.
  const eigenerName = spielstand.spieler[sitz].name;
  const gegnerName = spielstand.spieler[gegnerSitz].name;
  setzeText(elemente.nameEigen, eigenerName === gegnerName ? 'Du' : eigenerName);
  setzeText(elemente.nameGegner, gegnerName);

  schalte(elemente.standEigen, 'stand__spieler--dran', ichBinDran);
  schalte(elemente.standGegner, 'stand__spieler--dran', !ichBinDran);

  setzeText(
    elemente.zuganzeige,
    ichBinDran ? 'Du bist am Zug' : `${gegnerName} überlegt…`,
  );
  schalte(elemente.zuganzeige, 'zuganzeige--ich', ichBinDran);
  schalte(elemente.zuganzeige, 'zuganzeige--gegner', !ichBinDran);
  schalte(elemente.zuganzeige, 'zuganzeige--hinweis', false);
}
// ===========================================================================
// 4. Animation
// ===========================================================================

/**
 * Spielt den Zugbericht des Servers ab (Konzept 8.4).
 *
 * GRUNDSATZ: Die Animation ist DARSTELLUNG, KEINE BERECHNUNG. Sie folgt Zelle
 * fuer Zelle dem Pfad, den der Server mitgeschickt hat (Entscheidung E-6), und
 * zeichnet am Ende immer den vom Server gelieferten Zustand. Selbst wenn eine
 * Animation abbricht, ist das Bild danach korrekt.
 *
 * Dieser Abschnitt kennt Socket.io nicht.
 */

/** Wartezeit je gesaeter Kugel. */
const TAKT_SAAT = 110;

/** Wartezeit fuer Beute- und Extrazug-Hervorhebung. */
const TAKT_HINWEIS = 620;

/** Wartezeit fuer die Endabrechnung. */
const TAKT_ABRECHNUNG = 700;

/**
 * @param {object} deps
 * @param {HTMLElement} deps.brettElement
 * @param {Map<string, HTMLElement>} deps.zellen
 * @param {'unten'|'oben'} deps.sitz
 */
function erzeugeAnimator({ brettElement, zellen, sitz }) {
  /**
   * Laufende Nummer der aktuellen Animation.
   *
   * Trifft waehrend einer laufenden Animation bereits die naechste Nachricht
   * ein (etwa der Extrazug des Gegners), wird die laufende abgekuerzt und die
   * neue begonnen – die einzige Stelle, an der eine kleine Warteschlange
   * noetig ist (Konzept 8.4).
   */
  let laufNr = 0;

  /** Hilfszugriff auf ein Zellenelement anhand der kanonischen Adresse. */
  const elementVon = (zelle) => zellen.get(schluessel(zelle)) ?? null;

  /** Setzt eine Hervorhebungsklasse und nimmt sie nach der Dauer zurueck. */
  async function hebeHervor(zellenListe, klasse, dauer) {
    const elemente = zellenListe.map(elementVon).filter(Boolean);

    for (const element of elemente) element.classList.add(klasse);
    await warte(dauer);
    for (const element of elemente) element.classList.remove(klasse);
  }

  /**
   * Spielt einen Zug ab.
   *
   * @param {object} bericht      aus spiel:stand
   * @param {object} spielstand   der Zustand NACH dem Zug (die Wahrheit)
   * @returns {Promise<boolean>} true, wenn die Animation zu Ende lief;
   *          false, wenn eine neuere sie abgeloest hat
   */
  async function spiele(bericht, spielstand) {
    laufNr += 1;
    const meineNr = laufNr;

    /** Wurde diese Animation inzwischen von einer neueren abgeloest? */
    const abgeloest = () => meineNr !== laufNr;

    const ichBinDran = spielstand.amZug === sitz;

    // Eingabe sperren, solange sich das Bild bewegt (Konzept 8.5).
    schalte(brettElement, 'brett--gesperrt', true);

    try {
      // Bei "weniger Bewegung" entfallen alle Schritte und der Endzustand
      // wird sofort gezeichnet (WCAG 2.3.3).
      if (wenigerBewegung()) return true;

      // Arbeitskopie, die schrittweise auf den Endzustand zulaeuft. Sie beginnt
      // bei brettVorher, damit die Animation auch dann vom richtigen
      // Ausgangsbild startet, wenn zwischendurch neu gezeichnet wurde.
      const arbeit = bericht.brettVorher.map((reihe) => [...reihe]);

      // --- Startmulde leeren -------------------------------------------
      const [vonReihe, vonSpalte] = bericht.vonZelle;
      arbeit[vonReihe][vonSpalte] = 0;
      zeichneBrett(zellen, arbeit, sitz, false);

      // --- Saeen --------------------------------------------------------
      for (const [reihe, spalte] of bericht.pfad) {
        if (abgeloest()) return false;

        arbeit[reihe][spalte] += 1;
        zeichneBrett(zellen, arbeit, sitz, false);

        const element = elementVon([reihe, spalte]);
        if (element) {
          element.classList.add('zelle--saat');
          // Die Klasse wird nach dem Takt wieder entfernt, damit dieselbe
          // Zelle beim naechsten Durchlauf erneut aufleuchten kann.
          setTimeout(() => element.classList.remove('zelle--saat'), TAKT_SAAT);
        }

        await warte(TAKT_SAAT);
      }

      if (abgeloest()) return false;

      // --- Diebstahl ----------------------------------------------------
      if (bericht.beute) {
        const { eigeneZelle, gegnerZelle, anzahl } = bericht.beute;

        await hebeHervor([eigeneZelle, gegnerZelle], 'zelle--beute', TAKT_HINWEIS);
        if (abgeloest()) return false;

        // Die Kugeln wandern ins Haus des Spielers, der gezogen hat.
        const haus = bericht.sitz === 'unten' ? [1, 6] : [0, 0];
        arbeit[eigeneZelle[0]][eigeneZelle[1]] = 0;
        arbeit[gegnerZelle[0]][gegnerZelle[1]] = 0;
        arbeit[haus[0]][haus[1]] += anzahl;

        zeichneBrett(zellen, arbeit, sitz, false);
        await warte(TAKT_SAAT * 2);
      }

      if (abgeloest()) return false;

      // --- Extrazug -----------------------------------------------------
      if (bericht.extrazug) {
        const haus = bericht.sitz === 'unten' ? [1, 6] : [0, 0];
        await hebeHervor([haus], 'zelle--extrazug', TAKT_HINWEIS);
      }

      if (abgeloest()) return false;

      // --- Endabrechnung ------------------------------------------------
      if (bericht.abrechnung) {
        // Die Restkugeln wandern sichtbar in die Haeuser. Gezeichnet wird
        // dafuer schlicht der Endzustand mit einer Pause davor, damit der
        // Wechsel wahrnehmbar ist.
        await warte(TAKT_ABRECHNUNG);
      }

      return !abgeloest();
    } finally {
      // Der Endzustand wird IMMER gezeichnet – auch wenn oben etwas
      // schiefging oder die Animation abgeloest wurde. Das ist das
      // Sicherheitsnetz gegen Abweichungen zwischen Bild und Wahrheit.
      if (!abgeloest()) {
        zeichneBrett(zellen, spielstand.brett, sitz, ichBinDran);
        schalte(brettElement, 'brett--gesperrt', false);
      }
    }
  }

  /** Bricht eine laufende Animation ab, etwa beim Ansichtswechsel. */
  function brichAb() {
    laufNr += 1;
    schalte(brettElement, 'brett--gesperrt', false);
  }

  return { spiele, brichAb };
}
// ===========================================================================
// 5. Ansicht
// ===========================================================================

/**
 * Verantwortlich fuer: Brett aufbauen, Spielstand zeichnen, Klicks
 * entgegennehmen und Animationen anstossen. Die Regeln kennt sie NICHT – sie
 * schickt nur eine Muldennummer und zeichnet, was zurueckkommt.
 */

/**
 * Baut die Spielansicht auf.
 *
 * @param {object} deps
 * @param {object} deps.aktionen  Sendefunktionen
 */
export function erzeugeSpielAnsicht({ aktionen }) {
  const abschnitt = $('#ansicht-spiel');
  const brettElement = $('#brett');
  const knopfAufgeben = $('#knopf-aufgeben');
  const dialogAufgeben = $('#dialog-aufgeben');

  /** Gebuendelte Bezuege fuer zeichneStand(). */
  const elemente = {
    punkteEigen: $('#punkte-eigen'),
    punkteGegner: $('#punkte-gegner'),
    nameEigen: $('#name-eigen'),
    nameGegner: $('#name-gegner'),
    standEigen: $('#stand-eigen'),
    standGegner: $('#stand-gegner'),
    zuganzeige: $('#zuganzeige'),
  };

  /** @type {Map<string, HTMLElement>|null} */
  let zellen = null;

  /** @type {{spiele: Function, brichAb: Function}|null} */
  let animator = null;

  /** @type {'unten'|'oben'|null} */
  let sitz = null;

  /**
   * Eingabesperre vom Absenden bis zur Serverantwort (Konzept 8.5).
   *
   * Reine Bequemlichkeit gegen Doppelklicks – die eigentliche Absicherung
   * bleibt die Pruefung auf dem Server.
   */
  let wartetAufAntwort = false;

  /** Nummer der zuletzt gespielten Mulde – dorthin kehrt der Fokus zurueck. */
  let letzteMulde = null;

  /**
   * Gibt der Tastatur den Fokus zurueck.
   *
   * Waehrend der Animation sind alle Mulden `disabled`. Ein Button, der den
   * Fokus hat und gesperrt wird, verliert ihn an <body> – ohne diese Funktion
   * muesste man nach jedem Zug von oben neu tabben.
   *
   * Nur wenn der Fokus wirklich verloren ist: Wer bewusst woanders steht,
   * etwa auf "Partie aufgeben", wird nicht weggezogen.
   *
   * "Verloren" heisst: Fokus liegt auf <body> (Chrome, Safari) ODER noch auf
   * dem inzwischen gesperrten Button (so verhaelt sich Firefox teilweise).
   */
  function stelleFokusWiederHer(ichBinDran) {
    const aktiv = document.activeElement;
    const fokusVerloren = !aktiv || aktiv === document.body || aktiv.disabled;

    if (!ichBinDran || !fokusVerloren) return;

    const zuletzt = brettElement.querySelector(`button[data-mulde="${letzteMulde}"]`);
    const ziel = zuletzt && !zuletzt.disabled
      ? zuletzt
      : brettElement.querySelector('button.mulde:not(:disabled)');

    ziel?.focus();
  }

  /**
   * Ein einziger Listener auf dem Brett statt sechs auf den Mulden
   * (Ereignisdelegation, Konzept 8.7). Beim Aufraeumen gibt es damit auch nur
   * einen abzumelden.
   */
  function beiKlick(ereignis) {
    const knopf = ereignis.target.closest('button[data-mulde]');
    if (!knopf || knopf.disabled) return;

    if (wartetAufAntwort) return;

    const mulde = Number.parseInt(knopf.dataset.mulde, 10);
    if (!Number.isInteger(mulde)) return;

    wartetAufAntwort = true;
    letzteMulde = mulde;
    schalte(brettElement, 'brett--gesperrt', true);

    aktionen.zug(mulde);
  }

  brettElement.addEventListener('click', beiKlick);

  /**
   * Direkttasten 1 bis 6: spielen die eigene Mulde mit dieser Nummer.
   *
   * Es wird nur der passende Button "angeklickt" – damit laeuft alles ueber
   * `beiKlick`, und es gibt keine zweite Zuglogik.
   */
  function beiTaste(ereignis) {
    // Nur, wenn die Spielansicht sichtbar ist und kein Dialog darueber liegt.
    if (abschnitt.hidden || document.querySelector('dialog[open]')) return;

    // Kuerzel wie Cmd+1 (Browser-Tab wechseln) sind nicht gemeint.
    if (ereignis.metaKey || ereignis.ctrlKey || ereignis.altKey) return;

    const nummer = Number.parseInt(ereignis.key, 10);
    if (!(nummer >= 1 && nummer <= 6)) return;

    const knopf = brettElement.querySelector(`button[data-mulde="${nummer - 1}"]`);
    if (knopf && !knopf.disabled) knopf.click();
  }

  document.addEventListener('keydown', beiTaste);

  /**
   * Klick auf "Partie aufgeben" – mit Rueckfrage, weil es endgueltig ist.
   *
   * Die Rueckfrage ist der <dialog id="dialog-aufgeben"> statt window.confirm():
   * confirm() haelt das gesamte JavaScript an, auch Socket.io. Dieser Listener
   * laeuft VOR dem commandfor im HTML (im Browser gemessen) und oeffnet den
   * Dialog selbst; commandfor findet ihn dann offen und tut nichts mehr.
   * Browser ohne Invoker Commands sind so ebenfalls abgedeckt.
   */
  function beiAufgeben() {
    if (!dialogAufgeben.open) dialogAufgeben.showModal();
  }

  /**
   * Schliesst eine noch offene Rueckfrage – sie gehoert zur alten Partie.
   *
   * Fall: Die Rueckfrage ist offen, und die Partie endet gerade (der Gegner
   * gibt auf oder macht den letzten Zug). Ohne das hier bliebe sie offen, und
   * "Ja, aufgeben" traefe nach einer Revanche die NEUE Partie. close() ohne
   * Wert laesst returnValue leer, beiAufgebenGeschlossen() gibt also nicht auf.
   */
  function schliesseRueckfrage() {
    if (dialogAufgeben.open) dialogAufgeben.close();
  }

  /**
   * Rueckfrage geschlossen – mit einem der zwei Knoepfe oder mit Esc.
   *
   * Nur "Ja, aufgeben" (value="aufgeben") gibt auf. returnValue wird danach
   * geleert: Esc aendert ihn nicht, sonst gaelte beim naechsten Mal noch die
   * alte Wahl.
   */
  function beiAufgebenGeschlossen() {
    const wahl = dialogAufgeben.returnValue;
    dialogAufgeben.returnValue = '';
    if (wahl === 'aufgeben') aktionen.aufgeben();
  }

  knopfAufgeben.addEventListener('click', beiAufgeben);
  dialogAufgeben.addEventListener('close', beiAufgebenGeschlossen);

  return {
    zeige(sichtbar) {
      zeige(abschnitt, sichtbar);
      if (!sichtbar) {
        animator?.brichAb();
        schliesseRueckfrage();
      }
    },

    /**
     * Beginnt eine neue Partie: Brett neu aufbauen, weil sich mit dem Sitz
     * die Zuordnung der Zellen aendert.
     */
    starte(spielstand, eigenerSitz) {
      sitz = eigenerSitz;
      wartetAufAntwort = false;
      letzteMulde = null;
      knopfAufgeben.disabled = false;
      schliesseRueckfrage();

      // Eine laufende Animation der vorigen Partie gehoert zu alten Zellen.
      animator?.brichAb();
      zellen = baueBrett(brettElement, sitz);
      animator = erzeugeAnimator({ brettElement, zellen, sitz });

      this.aktualisiere(spielstand);

      // Der Knopf, der die Partie ausgeloest hat, ist jetzt versteckt – ohne
      // das hier stuende der Tastaturfokus auf <body>.
      stelleFokusWiederHer(spielstand.amZug === sitz);
    },

    /** Zeichnet einen Spielstand ohne Animation (Start, Wiederherstellung). */
    aktualisiere(spielstand) {
      if (!zellen || !sitz) return;

      const ichBinDran = spielstand.amZug === sitz;

      zeichneBrett(zellen, spielstand.brett, sitz, ichBinDran);
      zeichneStand(elemente, spielstand, sitz);

      schalte(brettElement, 'brett--gesperrt', false);
    },

    /**
     * Spielt einen Zug ab und zeichnet danach den Serverzustand.
     *
     * Die Eingabesperre wird erst hier wieder geloest – nicht vorher, sonst
     * koennte waehrend der Animation ein zweiter Zug abgeschickt werden.
     */
    async spieleZug(bericht, spielstand) {
      if (!zellen || !sitz || !animator) return;

      zeichneStand(elemente, spielstand, sitz);

      // Nach dem letzten Zug gibt es nichts mehr aufzugeben. Sonst liefe ein
      // Klick waehrend der Schlussanimation ins Leere (KEINE_PARTIE).
      knopfAufgeben.disabled = spielstand.status !== 'LAEUFT';

      // Sichtbarer Hinweis fuer die beiden Sonderregeln (FA-13).
      if (bericht.beute) {
        const wer = bericht.sitz === sitz ? 'Du klaust' : 'Gegner klaut';
        setzeText(elemente.zuganzeige, `${wer} ${bericht.beute.anzahl} Kugeln!`);
        schalte(elemente.zuganzeige, 'zuganzeige--hinweis', true);
      } else if (bericht.extrazug) {
        setzeText(elemente.zuganzeige, bericht.sitz === sitz
          ? 'Extrazug! Du bist noch einmal dran.'
          : 'Extrazug für den Gegner.');
        schalte(elemente.zuganzeige, 'zuganzeige--hinweis', true);
      }

      const zuEnde = await animator.spiele(bericht, spielstand);

      // Abgeloest? Dann zeichnet die neuere Animation – dieser (alte) Stand
      // darf die Anzeige nicht mehr ueberschreiben.
      if (!zuEnde) return;

      // Nach der Animation gilt wieder der normale Text.
      zeichneStand(elemente, spielstand, sitz);
      wartetAufAntwort = false;
      stelleFokusWiederHer(spielstand.amZug === sitz);
    },

    /**
     * Zeigt eine abgelehnte Eingabe an der betroffenen Mulde (Konzept 6.7).
     *
     * Eine kurze visuelle Ablehnung ist hier angemessener als eine
     * Fehlermeldung: Der haeufigste Grund ist ein Klick, der eine
     * Sekundenbruchteil zu spaet kam.
     */
    melde(code) {
      wartetAufAntwort = false;
      schalte(brettElement, 'brett--gesperrt', false);

      if (code === 'MULDE_LEER' || code === 'NICHT_AM_ZUG') {
        const mulden = brettElement.querySelectorAll('.mulde--eigen');
        for (const mulde of mulden) {
          mulde.classList.add('mulde--abgelehnt');
          setTimeout(() => mulde.classList.remove('mulde--abgelehnt'), 300);
        }
      }

      // Nach einer Ablehnung bin ich weiter am Zug, sonst waere sie nicht
      // gekommen – der Fokus darf also zurueck aufs Brett.
      stelleFokusWiederHer(true);
    },

    raeumeAuf() {
      brettElement.removeEventListener('click', beiKlick);
      document.removeEventListener('keydown', beiTaste);
      knopfAufgeben.removeEventListener('click', beiAufgeben);
      dialogAufgeben.removeEventListener('close', beiAufgebenGeschlossen);
      animator?.brichAb();
    },
  };
}

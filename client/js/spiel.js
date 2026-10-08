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

/** Das Haus: grosse Zahl, darunter die Kugeln, ganz unten die Beschriftung. */
function erzeugeHaus(rolle) {
  const eigen = rolle.seite === 'eigen';

  return erzeuge('div', { klassen: ['haus'] }, [
    erzeuge('span', { klassen: ['haus__zahl'], text: '0' }),
    erzeuge('span', { klassen: ['kugeln'] }),
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
    klassen: alsButton ? ['mulde', 'mulde--eigen'] : ['mulde'],
    attribute,
  }, kinder);
}

/**
 * Passt die Zahl der gezeichneten Kugeln an – in Mulden und Haeusern.
 *
 * Es wird JEDE Kugel gezeichnet, egal wie viele es sind. Damit alle
 * hineinpassen, macht das CSS sie bei vielen Kugeln kleiner (css/05-brett.css).
 *
 * Es werden nur Kugeln hinzugefuegt oder entfernt, nie alle neu erzeugt – das
 * haelt die Animation ruhig. Nebenbei startet jede neu eingefuegte Kugel ihre
 * CSS-Animation "einfallen": Man sieht sie in die Mulde fallen.
 */
function setzeKugeln(kugelnContainer, anzahl) {
  const vorhanden = kugelnContainer.childElementCount;

  for (let i = vorhanden; i < anzahl; i += 1) {
    kugelnContainer.append(erzeuge('span', { klassen: ['kugel'] }));
  }
  for (let i = vorhanden; i > anzahl; i -= 1) {
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

/** Haus: Zahl und Kugeln. */
function zeichneHaus(element, anzahl) {
  const zahl = element.querySelector('.haus__zahl');
  const kugeln = element.querySelector('.kugeln');

  if (zahl) setzeText(zahl, anzahl);
  if (kugeln) setzeKugeln(kugeln, anzahl);
}

/**
 * Mulde: Kugeln, Zahl und Zustand.
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

  if (kugeln) setzeKugeln(kugeln, anzahl);
  if (zahl) setzeText(zahl, anzahl);

  schalte(mulde, 'mulde--leer', anzahl === 0);

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
  const [eigenReihe, eigenSpalte] = hausVon(sitz);
  const [gegnerReihe, gegnerSpalte] = hausVon(gegnerSitz);
  setzeText(elemente.punkteEigen, spielstand.brett[eigenReihe][eigenSpalte]);
  setzeText(elemente.punkteGegner, spielstand.brett[gegnerReihe][gegnerSpalte]);

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
/**
 * Hinweis zu einer Sonderregel (Klauen, Extrazug) – oder '' ohne Sonderregel.
 *
 * @param {object} bericht  Zugbericht des Servers
 * @param {'unten'|'oben'} sitz  eigener Sitz
 */
export function hinweisText(bericht, sitz) {
  const ichWars = bericht.sitz === sitz;

  // REGEL 3.4: `anzahl` sind die Kugeln von gegenüber plus die eigene letzte
  // Kugel. Der Satz nennt deshalb, was ins Haus wandert, nicht „N geklaut“.
  // Es sind immer mindestens 2 – die Mehrzahl stimmt also immer.
  if (bericht.beute) {
    const anzahl = bericht.beute.anzahl;
    return ichWars
      ? `Du klaust! ${anzahl} Kugeln wandern in dein Haus.`
      : `Gegner klaut! ${anzahl} Kugeln wandern in sein Haus.`;
  }
  if (bericht.extrazug) {
    return ichWars ? 'Extrazug! Du bist noch einmal dran.' : 'Extrazug für den Gegner.';
  }
  return '';
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

/**
 * Wartezeit je gesaeter Kugel – so lang wie --dauer-kugel in
 * css/02-tokens.css, damit jede Kugel zu Ende gefallen ist, bevor die
 * naechste kommt.
 */
const TAKT_SAAT = 180;

/** Wartezeit fuer Beute- und Extrazug-Hervorhebung. */
const TAKT_HINWEIS = 640;

/** Wartezeit fuer die Endabrechnung. */
const TAKT_ABRECHNUNG = 700;

/**
 * @param {object} deps
 * @param {HTMLElement} deps.brettElement
 * @param {Map<string, HTMLElement>} deps.zellen
 * @param {'unten'|'oben'} deps.sitz
 */
export function hausVon(sitz) {
  return sitz === 'unten' ? [1, 6] : [0, 0];
}

/** Kopiert ein Bild, damit spätere Schritte frühere Bilder nicht verändern. */
function animationsbild(brett, hervorheben = [], klasse = '', dauer = TAKT_SAAT) {
  return { brett: brett.map((reihe) => [...reihe]), hervorheben, klasse, dauer };
}

/** Folgt nur dem Bericht; gültige Züge und Endstand bestimmt der Server. */
export function schritteDesZuges(bericht) {
  const brett = bericht.brettVorher.map((reihe) => [...reihe]);
  const [reihe, spalte] = bericht.vonZelle;
  brett[reihe][spalte] = 0;
  const bilder = [animationsbild(brett)];

  for (const [zielReihe, zielSpalte] of bericht.pfad) {
    brett[zielReihe][zielSpalte] += 1;
    bilder.push(animationsbild(brett, [[zielReihe, zielSpalte]], 'zelle--saat'));
  }
  if (bericht.beute) {
    const { eigeneZelle, gegnerZelle, anzahl } = bericht.beute;
    bilder.push(animationsbild(brett, [eigeneZelle, gegnerZelle],
      'zelle--beute', TAKT_HINWEIS));
    brett[eigeneZelle[0]][eigeneZelle[1]] = 0;
    brett[gegnerZelle[0]][gegnerZelle[1]] = 0;
    const [hausReihe, hausSpalte] = hausVon(bericht.sitz);
    brett[hausReihe][hausSpalte] += anzahl;
    bilder.push(animationsbild(brett, [], '', TAKT_SAAT * 2));
  }
  if (bericht.extrazug) {
    bilder.push(animationsbild(brett, [hausVon(bericht.sitz)],
      'zelle--extrazug', TAKT_HINWEIS));
  }
  if (bericht.abrechnung) {
    bilder.push(animationsbild(brett, [], '', TAKT_ABRECHNUNG));
  }
  return bilder;
}

function erzeugeAnimator({ brettElement, zellen, sitz }) {
  let laufNr = 0;
  const elementVon = (zelle) => zellen.get(schluessel(zelle));

  function entferneMarkierungen() {
    for (const element of zellen.values()) {
      element.classList.remove('zelle--zuletzt', 'zelle--saat',
        'zelle--beute', 'zelle--extrazug');
    }
  }

  async function zeigeBild(bild, meineNr) {
    zeichneBrett(zellen, bild.brett, sitz, false);
    const elemente = bild.hervorheben.map(elementVon);
    for (const element of elemente) element.classList.add(bild.klasse);
    await warte(bild.dauer);
    if (meineNr !== laufNr) return;
    for (const element of elemente) element.classList.remove(bild.klasse);
  }

  async function spiele(bericht, spielstand) {
    laufNr += 1;
    const meineNr = laufNr;
    schalte(brettElement, 'brett--gesperrt', true);
    entferneMarkierungen();
    try {
      if (!wenigerBewegung()) {
        for (const bild of schritteDesZuges(bericht)) {
          if (meineNr !== laufNr) return false;
          await zeigeBild(bild, meineNr);
        }
      }
    } catch (fehler) {
      console.error('Zug-Animation gescheitert – zeige den Serverstand.', fehler);
    }
    if (meineNr !== laufNr) return false;
    zeichneBrett(zellen, spielstand.brett, sitz, spielstand.amZug === sitz);
    schalte(brettElement, 'brett--gesperrt', false);
    elementVon(bericht.vonZelle)?.classList.add('zelle--zuletzt');
    return true;
  }

  function brichAb() {
    laufNr += 1;
    entferneMarkierungen();
    schalte(brettElement, 'brett--gesperrt', false);
  }

  return { spiele, brichAb };
}
// ===========================================================================
// 5. Ansicht
// ===========================================================================

export function muldeAusTaste(taste) {
  return ['1', '2', '3', '4', '5', '6'].indexOf(taste);
}

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
   * "Verloren" heisst: Fokus liegt auf <body> (Chrome, Safari), noch auf
   * dem inzwischen gesperrten Button (so verhaelt sich Firefox teilweise)
   * ODER in einer gerade versteckten Ansicht – etwa auf "Gegner suchen", das
   * die Partie ausgeloest hat. Dort schiebt der Browser den Fokus erst einen
   * Augenblick spaeter auf <body>; ohne die dritte Bedingung kaeme diese
   * Funktion also zu frueh und taete nichts.
   */
  function stelleFokusWiederHer() {
    const aktiv = document.activeElement;
    const fokusVerloren = !aktiv
      || aktiv === document.body
      || aktiv.disabled
      || aktiv.closest('[hidden]') !== null;

    if (!fokusVerloren) return;

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
    // Die ganze rechteckige Zelle zählt, nicht nur die runde Mulde darin:
    // Ein Klick in die Ecke trifft das <li>, nicht den runden Button.
    const zelle = ereignis.target.closest('.zelle');
    if (!zelle) return;

    const knopf = zelle.querySelector('button[data-mulde]');
    if (!knopf || knopf.disabled) return;

    if (wartetAufAntwort) return;

    const mulde = Number.parseInt(knopf.dataset.mulde, 10);
    if (!Number.isInteger(mulde)) return;

    wartetAufAntwort = true;
    letzteMulde = mulde;
    schalte(brettElement, 'brett--gesperrt', true);

    aktionen.zug(mulde);
  }

  /**
   * Direkttasten 1 bis 6: spielen die eigene Mulde mit dieser Nummer.
   *
   * Es wird nur der passende Button "angeklickt" – damit laeuft alles ueber
   * `beiKlick`, und es gibt keine zweite Zuglogik.
   */
  function beiTaste(ereignis) {
    // Nicht, wenn ein Dialog darueber liegt (Ergebnis, Rueckfrage,
    // Einstellungen) – die Spielansicht bleibt unter dem Ergebnis sichtbar.
    if (document.querySelector('dialog[open]')) return;

    // Kuerzel wie Cmd+1 (Browser-Tab wechseln) sind nicht gemeint.
    if (ereignis.metaKey || ereignis.ctrlKey || ereignis.altKey) return;

    const mulde = muldeAusTaste(ereignis.key);
    if (mulde === -1) return;

    const knopf = brettElement.querySelector(`button[data-mulde="${mulde}"]`);
    if (knopf && !knopf.disabled) knopf.click();
  }

  /**
   * Klick auf "Partie aufgeben" – mit Rueckfrage, weil es endgueltig ist.
   *
   * Die Rueckfrage ist der <dialog id="dialog-aufgeben"> statt window.confirm():
   * confirm() haelt das gesamte JavaScript an, auch Socket.io.
   */
  function beiAufgeben() {
    if (dialogAufgeben.open) return;
    // Beim Oeffnen leeren: Esc setzt returnValue nicht in jedem Browser
    // zurueck (Chromium tut es, die aeltere HTML-Spezifikation nicht), und
    // das close-Ereignis kann nach einem Ansichtswechsel ohne Listener
    // verpuffen. So gilt nie eine alte Wahl.
    dialogAufgeben.returnValue = '';
    dialogAufgeben.showModal();
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
   * Nur "Ja, aufgeben" (value="aufgeben") gibt auf.
   */
  function beiAufgebenGeschlossen() {
    if (dialogAufgeben.returnValue === 'aufgeben') aktionen.aufgeben();
  }

  /**
   * Listener nur, solange die Spielansicht sichtbar ist (Anforderungen 6.3).
   * Waehrend des Ergebnisdialogs gilt sie als sichtbar (main.js) – deshalb
   * prueft beiTaste, ob ein Dialog offen ist.
   */
  function meldeListenerAn() {
    brettElement.addEventListener('click', beiKlick);
    document.addEventListener('keydown', beiTaste);
    knopfAufgeben.addEventListener('click', beiAufgeben);
    dialogAufgeben.addEventListener('close', beiAufgebenGeschlossen);
  }

  function meldeListenerAb() {
    brettElement.removeEventListener('click', beiKlick);
    document.removeEventListener('keydown', beiTaste);
    knopfAufgeben.removeEventListener('click', beiAufgeben);
    dialogAufgeben.removeEventListener('close', beiAufgebenGeschlossen);
    for (const mulde of brettElement.querySelectorAll('.mulde--eigen')) {
      mulde.removeEventListener('animationend', beiRuettelnEnde);
      mulde.classList.remove('mulde--abgelehnt');
    }
  }

  /** Zeigt den Hinweis zu Extrazug oder Klauen – ohne Sonderregel nichts. */
  function zeigeSonderregel(bericht) {
    const hinweis = hinweisText(bericht, sitz);
    if (hinweis === '') return;
    setzeText(elemente.zuganzeige, hinweis);
    schalte(elemente.zuganzeige, 'zuganzeige--hinweis', true);
  }

  function zeichneAlles(spielstand) {
    zeichneBrett(zellen, spielstand.brett, sitz, spielstand.amZug === sitz);
    zeichneStand(elemente, spielstand, sitz);
    schalte(brettElement, 'brett--gesperrt', false);
  }

  function beiRuettelnEnde(ereignis) {
    // Kugel-Animationen steigen ebenfalls auf: Nur die Mulde selbst zählt.
    if (ereignis.target !== ereignis.currentTarget
      || ereignis.animationName !== 'ruetteln') return;
    const mulde = ereignis.currentTarget;
    mulde.classList.remove('mulde--abgelehnt');
    mulde.removeEventListener('animationend', beiRuettelnEnde);
  }

  function ruettleMulden() {
    if (wenigerBewegung()) return;
    for (const mulde of brettElement.querySelectorAll('.mulde--eigen')) {
      mulde.addEventListener('animationend', beiRuettelnEnde);
      mulde.classList.add('mulde--abgelehnt');
    }
  }

  function zeige(sichtbar) {
    zeige(abschnitt, sichtbar);

    // ACHTUNG: zeige(true) kommt bei jeder Zustandsaenderung, auch mitten
    // im Zug. Hier darf deshalb nichts zurueckgesetzt werden – nur anmelden.
    if (sichtbar) {
      meldeListenerAn();
      return;
    }
    animator?.brichAb();
    schliesseRueckfrage();
    meldeListenerAb();
  }

/**
     * Beginnt eine neue Partie: Brett neu aufbauen, weil sich mit dem Sitz
     * die Zuordnung der Zellen aendert.
     */
  function starte(spielstand, eigenerSitz) {
    sitz = eigenerSitz;
    wartetAufAntwort = false;
    letzteMulde = null;
    knopfAufgeben.disabled = false;
    schliesseRueckfrage();

    // Eine laufende Animation der vorigen Partie gehoert zu alten Zellen.
    animator?.brichAb();
    zellen = baueBrett(brettElement, sitz);
    animator = erzeugeAnimator({ brettElement, zellen, sitz });

    zeichneAlles(spielstand);

    // Der Knopf, der die Partie ausgeloest hat, ist jetzt versteckt – ohne
    // das hier stuende der Tastaturfokus auf <body>.
    stelleFokusWiederHer();
  }

/**
     * Die Partie ist auf dem Server vorbei (letzter Zug, Aufgabe, Abbruch).
     *
     * Es gibt nichts mehr aufzugeben – sonst liefe ein Klick während der
     * Schlussanimation ins Leere (KEINE_PARTIE). Eine offene Rückfrage
     * „Partie aufgeben?“ wird geschlossen, damit nicht zwei Dialoge
     * übereinanderliegen, wenn gleich das Ergebnis erscheint.
     */
  function beende() {
    knopfAufgeben.disabled = true;
    schliesseRueckfrage();
  }

/**
     * Spielt einen Zug ab und zeichnet danach den Serverzustand.
     *
     * Die Eingabesperre wird erst hier wieder geloest – nicht vorher, sonst
     * koennte waehrend der Animation ein zweiter Zug abgeschickt werden.
     */
  async function spieleZug(bericht, spielstand) {
    if (!zellen || !sitz || !animator) return;

    // Punktestand und „am Zug“ werden erst NACH der Animation gezeichnet –
    // sonst stünde oben schon der Endstand, während die Kugeln noch fallen.

    // Der Hinweis zur Sonderregel erscheint dagegen sofort.
    zeigeSonderregel(bericht);

    const zuEnde = await animator.spiele(bericht, spielstand);

    // Abgeloest? Dann zeichnet die neuere Animation – dieser (alte) Stand
    // darf die Anzeige nicht mehr ueberschreiben.
    if (!zuEnde) return;

    // Nach der Animation gilt wieder der normale Text.
    zeichneStand(elemente, spielstand, sitz);

    // Ohne Animation wäre der Hinweis sofort wieder überschrieben und nie zu
    // sehen. Er bleibt dann bis zum nächsten Zug stehen.
    if (wenigerBewegung()) zeigeSonderregel(bericht);
    wartetAufAntwort = false;
    stelleFokusWiederHer();
  }

/**
     * Zeigt eine abgelehnte Eingabe an der betroffenen Mulde (Konzept 6.7).
     *
     * Eine kurze visuelle Ablehnung ist hier angemessener als eine
     * Fehlermeldung: Der haeufigste Grund ist ein Klick, der eine
     * Sekundenbruchteil zu spaet kam.
     */
  function melde(text, { ruetteln = false } = {}) {
    wartetAufAntwort = false;
    schalte(brettElement, 'brett--gesperrt', false);
    setzeText(elemente.zuganzeige, text);
    schalte(elemente.zuganzeige, 'zuganzeige--hinweis', true);

    if (ruetteln) {
      ruettleMulden();
    }

    // Nach einer Ablehnung bin ich weiter am Zug, sonst waere sie nicht
    // gekommen – der Fokus darf also zurueck aufs Brett.
    stelleFokusWiederHer();
  }

  return { zeige, starte, beende, spieleZug, melde };
}

/**
 * spiel.js – Brett aus eigener Sicht, Anzeige und Animation.
 * Der Client folgt dem Zugbericht. Regeln und gültige Züge bestimmt der Server.
 * Inhalt: == 1. Anzeigeordnung und Zeiten · == 2. Sicht
 *         == 3. Brett aufbauen · == 4. Zeichnen · == 5. Animation
 *         == 6. Ansicht: Klicks, Tasten und Aufgeben
 * Benutzt von main.js; benutzt dom.js. Reine Helfer prüft zusätzlich Jest.
 */

import {
  $,
  erzeuge,
  zeige as zeigeElement,
  schalte,
  setzeText,
  warte,
  wenigerBewegung,
} from './dom.js';

// ACHTUNG: zeigeElement benennt den DOM-Helfer eindeutig. Die Ansicht hat
// ebenfalls eine Funktion zeige; ohne Alias würde sie sich selbst aufrufen.

// == 1. Anzeigeordnung und Zeiten =========================================
// Die DOM-Reihenfolge bleibt für beide Sitze gleich. baueBrett übersetzt diese
// Anzeigekoordinaten zurück in die Server-Sicht.
const ANZEIGE_REIHENFOLGE = [
  [0, 0],
  [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6],
  [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5],
  [1, 6],
];

// ACHTUNG: 180 ms passen zu --dauer-kugel in css/02-tokens.css.
const TAKT_SAAT = 180;

// ACHTUNG: Zwei Durchläufe mit --dauer-mittel dauern zusammen 640 ms.
const TAKT_HINWEIS = 640;

// EINSTELLBAR: Pause vor der Endabrechnung, damit der Wechsel sichtbar wird.
const TAKT_ABRECHNUNG = 700;

// == 2. Sicht ============================================================
// Der Sitz oben braucht eine halbe Drehung. Das Serverbrett selbst bleibt
// unverändert; nur die Koordinaten wechseln die Sicht.
export function ausSicht(sitz, [reihe, spalte]) {
  return sitz === 'unten' ? [reihe, spalte] : [1 - reihe, 6 - spalte];
}

// REGEL 3.1: Nach der Drehung liegt das eigene Haus für beide Sitze rechts.
export function rolleVon(sitz, zelle) {
  const [reihe, spalte] = ausSicht(sitz, zelle);

  if (reihe === 1) {
    return spalte === 6
      ? { art: 'haus', seite: 'eigen', pos: null }
      : { art: 'mulde', seite: 'eigen', pos: spalte };
  }

  return spalte === 0
    ? { art: 'haus', seite: 'gegner', pos: null }
    : { art: 'mulde', seite: 'gegner', pos: 6 - spalte };
}

// Serverkoordinaten sind zugleich Map-Schlüssel und Haken für die Browsertests.
export function schluessel([reihe, spalte]) {
  return `${reihe}-${spalte}`;
}

export function alleZellen() {
  const zellen = [];
  for (let reihe = 0; reihe < 2; reihe += 1) {
    for (let spalte = 0; spalte < 7; spalte += 1) {
      zellen.push([reihe, spalte]);
    }
  }
  return zellen;
}

// == 3. Brett aufbauen ====================================================
function baueBrett(container, sitz) {
  container.replaceChildren();

  const zellen = new Map();

  for (const anzeigeZelle of ANZEIGE_REIHENFOLGE) {
    // Eine halbe Drehung ist ihre eigene Umkehrung: Anzeige zurück in
    // Server-Sicht.
    const zelle = ausSicht(sitz, anzeigeZelle);
    const rolle = rolleVon(sitz, zelle);

    const element = erzeugeZelle(zelle, rolle);
    zellen.set(schluessel(zelle), element);
    container.append(element);
  }

  return zellen;
}

// WCAG: Nur eigene Mulden sind native Buttons; gegnerische Felder sind keine
// Bedienelemente.
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

// WCAG: Die Beschriftung steht vorn; vorgelesen wird erst, wessen Haus es
// ist, dann die Punktzahl.
function erzeugeHaus(rolle) {
  const eigen = rolle.seite === 'eigen';

  return erzeuge('div', { klassen: ['haus'] }, [
    erzeuge('span', {
      klassen: ['haus__beschriftung'],
      text: eigen ? 'Dein Haus' : 'Haus des Gegners',
    }),
    erzeuge('span', { klassen: ['haus__zahl'], text: '0' }),
    erzeuge('span', { klassen: ['kugeln'] }),
  ]);
}

function erzeugeMulde(rolle, alsButton) {
  const tag = alsButton ? 'button' : 'div';

  const attribute = alsButton
    ? { type: 'button', 'data-mulde': rolle.pos }
    : {};

  const kinder = [
    erzeuge('span', { klassen: ['kugeln'] }),
    erzeuge('span', { klassen: ['mulde__zahl'], text: '0' }),
  ];

  if (alsButton) {
    kinder.push(erzeuge('span', {
      klassen: ['mulde__taste'], text: rolle.pos + 1,
    }));
  }

  return erzeuge(tag, {
    klassen: alsButton ? ['mulde', 'mulde--eigen'] : ['mulde'],
    attribute,
  }, kinder);
}

// Vorhandene Kugeln behalten: Neu eingefügte Kugeln starten ihre CSS-Animation.
function setzeKugeln(kugelnContainer, anzahl) {
  const vorhanden = kugelnContainer.childElementCount;

  for (let i = vorhanden; i < anzahl; i += 1) {
    kugelnContainer.append(erzeuge('span', { klassen: ['kugel'] }));
  }
  for (let i = vorhanden; i > anzahl; i -= 1) {
    kugelnContainer.lastElementChild?.remove();
  }
}

// == 4. Zeichnen ==========================================================
function zeichneBrett(zellen, brett, sitz, ichBinDran) {
  for (const zelle of alleZellen()) {
    const element = zellen.get(schluessel(zelle));

    const anzahl = brett[zelle[0]][zelle[1]];
    const rolle = rolleVon(sitz, zelle);

    if (rolle.art === 'haus') {
      zeichneHaus(element, anzahl);
    } else {
      zeichneMulde(element, anzahl, rolle, ichBinDran);
    }
  }
}

function zeichneHaus(element, anzahl) {
  setzeText($('.haus__zahl', element), anzahl);
  setzeKugeln($('.kugeln', element), anzahl);
}

function zeichneMulde(element, anzahl, rolle, ichBinDran) {
  const mulde = $('.mulde', element);
  setzeKugeln($('.kugeln', mulde), anzahl);
  setzeText($('.mulde__zahl', mulde), anzahl);

  schalte(mulde, 'mulde--leer', anzahl === 0);

  if (rolle.seite !== 'eigen') return;

  // WCAG: Der title nennt Nummer und Kugelzahl beim Zeigen mit der Maus;
  // Screenreader lesen ihn als Beschreibung des Knopfs vor.
  mulde.title = beschreibeMulde(rolle.pos, anzahl);

  const spielbar = ichBinDran && anzahl > 0;

  schalte(mulde, 'mulde--spielbar', spielbar);
  schalte(mulde, 'mulde--gesperrt', !spielbar);

  // WCAG: disabled sperrt auch die Tastatur, nicht nur den Mausklick.
  mulde.disabled = !spielbar;
}

function beschreibeMulde(pos, anzahl) {
  const einheit = anzahl === 1 ? 'Kugel' : 'Kugeln';
  return `Mulde ${pos + 1}: ${anzahl} ${einheit}`;
}

// Die Rollen „Du“ und „Gegner“ stehen fest im HTML. Namen sind nur Anzeige
// und dürfen deshalb auch „Du“ lauten oder gleich sein.
function zeichneStand(elemente, spielstand, sitz) {
  const gegnerSitz = sitz === 'unten' ? 'oben' : 'unten';
  const ichBinDran = spielstand.amZug === sitz;

  const [eigenReihe, eigenSpalte] = hausVon(sitz);
  const [gegnerReihe, gegnerSpalte] = hausVon(gegnerSitz);
  setzeText(elemente.punkteEigen, spielstand.brett[eigenReihe][eigenSpalte]);
  setzeText(elemente.punkteGegner, spielstand.brett[gegnerReihe][gegnerSpalte]);

  setzeText(elemente.nameEigen, spielstand.spieler[sitz].name);
  setzeText(elemente.nameGegner, spielstand.spieler[gegnerSitz].name);

  schalte(elemente.standEigen, 'stand__spieler--dran', ichBinDran);
  schalte(elemente.standGegner, 'stand__spieler--dran', !ichBinDran);

  // Ohne Namen bleibt der Zugtext kurz und eindeutig, wie lang der Name
  // auch ist.
  setzeText(
    elemente.zuganzeige,
    ichBinDran ? 'Du bist am Zug' : 'Der Gegner ist am Zug',
  );
  schalte(elemente.zuganzeige, 'zuganzeige--ich', ichBinDran);
  schalte(elemente.zuganzeige, 'zuganzeige--gegner', !ichBinDran);
  schalte(elemente.zuganzeige, 'zuganzeige--hinweis', false);
}

// REGEL 3.4: beute.anzahl enthält auch die eigene letzte Kugel; der Text nennt
// den Hauszuwachs.
export function hinweisText(bericht, sitz) {
  const ichWars = bericht.sitz === sitz;

  // REGEL 3.4: Klauen anzeigen; das Protokollfeld heißt weiterhin beute.
  if (bericht.beute) {
    const anzahl = bericht.beute.anzahl;
    return ichWars
      ? `Du klaust! ${anzahl} Kugeln wandern in dein Haus.`
      : `Gegner klaut! ${anzahl} Kugeln wandern in sein Haus.`;
  }
  if (bericht.extrazug) {
    return ichWars
      ? 'Extrazug! Du bist noch einmal dran.'
      : 'Extrazug für den Gegner.';
  }
  return '';
}

// == 5. Animation ========================================================
export function hausVon(sitz) {
  return sitz === 'unten' ? [1, 6] : [0, 0];
}

// Jedes Bild besitzt seine eigene Brettkopie; spätere Schritte ändern es nicht.
function animationsbild(
  brett, hervorheben = [], klasse = '', dauer = TAKT_SAAT,
) {
  return {
    brett: brett.map((reihe) => [...reihe]), hervorheben, klasse, dauer,
  };
}

// Nur den gelieferten Pfad abzeichnen, keine Zugprüfung oder Siegerrechnung.
export function schritteDesZuges(bericht) {
  const brett = bericht.brettVorher.map((reihe) => [...reihe]);
  const [reihe, spalte] = bericht.vonZelle;
  brett[reihe][spalte] = 0;
  const bilder = [animationsbild(brett)];

  // REGEL 3.2: Ein Bild je gesäter Kugel im vom Server gelieferten Pfad.
  for (const [zielReihe, zielSpalte] of bericht.pfad) {
    brett[zielReihe][zielSpalte] += 1;
    bilder.push(animationsbild(
      brett, [[zielReihe, zielSpalte]], 'zelle--saat',
    ));
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
    // Eine alte Pause darf Hervorhebungen einer neueren Animation nicht
    // entfernen.
    if (meineNr !== laufNr) return;
    for (const element of elemente) element.classList.remove(bild.klasse);
  }

  async function spieleBilder(bericht, meineNr) {
    if (wenigerBewegung()) return;
    for (const bild of schritteDesZuges(bericht)) {
      if (meineNr !== laufNr) return;
      await zeigeBild(bild, meineNr);
    }
  }

  // SCHUTZ: Die laufende Nummer verhindert Zeichnen einer bereits abgelösten
  // Animation.
  async function spiele(bericht, spielstand) {
    laufNr += 1;
    const meineNr = laufNr;
    schalte(brettElement, 'brett--gesperrt', true);
    entferneMarkierungen();
    try {
      await spieleBilder(bericht, meineNr);
    } catch (fehler) {
      console.error(
        'Zug-Animation gescheitert – zeige den Serverstand.', fehler,
      );
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

// == 6. Ansicht: Klicks, Tasten und Aufgeben ===============================
export function muldeAusTaste(taste) {
  return ['1', '2', '3', '4', '5', '6'].indexOf(taste);
}

export function erzeugeSpielAnsicht({ aktionen }) {
  const abschnitt = $('#ansicht-spiel');
  const brettElement = $('#brett');
  const knopfAufgeben = $('#knopf-aufgeben');
  const dialogAufgeben = $('#dialog-aufgeben');

  const elemente = {
    punkteEigen: $('#punkte-eigen'),
    punkteGegner: $('#punkte-gegner'),
    nameEigen: $('#name-eigen'),
    nameGegner: $('#name-gegner'),
    standEigen: $('#stand-eigen'),
    standGegner: $('#stand-gegner'),
    zuganzeige: $('#zuganzeige'),
  };

  let zellen = null;
  let animator = null;
  let sitz = null;

  // Lokale Doppelklicks sperren; verbindlich prüft weiterhin der Server jeden
  // Zug.
  let wartetAufAntwort = false;

  let letzteMulde = null;

  // WCAG: Nur verlorenen Fokus zurückgeben; bewusst gewählter Fokus bleibt
  // stehen.
  function stelleFokusWiederHer() {
    const aktiv = document.activeElement;
    const fokusVerloren = !aktiv
      || aktiv === document.body
      || aktiv.disabled
      || aktiv.closest('[hidden]') !== null;

    if (!fokusVerloren) return;

    const zuletzt = brettElement.querySelector(
      `button[data-mulde="${letzteMulde}"]`,
    );
    const ziel = zuletzt && !zuletzt.disabled
      ? zuletzt
      : brettElement.querySelector('button.mulde:not(:disabled)');

    ziel?.focus();
  }

  // WCAG: Die ganze rechteckige Zelle zählt, auch außerhalb der runden Mulde.
  function beiKlick(ereignis) {
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

  // Offene Dialoge und Browserkürzel haben Vorrang vor den Tasten 1 bis 6.
  function beiTaste(ereignis) {
    if (document.querySelector('dialog[open]')) return;

    if (ereignis.metaKey || ereignis.ctrlKey || ereignis.altKey) return;

    const mulde = muldeAusTaste(ereignis.key);
    if (mulde === -1) return;

    const knopf = brettElement.querySelector(`button[data-mulde="${mulde}"]`);
    if (knopf && !knopf.disabled) knopf.click();
  }

  function beiAufgeben() {
    if (dialogAufgeben.open) return;

    // Alte Wahl löschen: Esc soll nach einem Ansichtswechsel nie versehentlich
    // aufgeben.
    dialogAufgeben.returnValue = '';
    dialogAufgeben.showModal();
  }

  function schliesseRueckfrage() {
    if (dialogAufgeben.open) dialogAufgeben.close();
  }

  function beiAufgebenGeschlossen() {
    if (dialogAufgeben.returnValue === 'aufgeben') aktionen.aufgeben();
  }

  // Listener nur in der sichtbaren Spielansicht; unter dem Ergebnis bleibt sie
  // sichtbar.
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

  // ACHTUNG: animationName ruetteln steht in css/07-zustaende.css.
  function beiRuettelnEnde(ereignis) {
    // animationend steigt von Kugeln zur Mulde auf. Nur das Ende ihres eigenen
    // Rüttelns darf die Fehlerklasse und diesen Listener entfernen.
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

  // zeige(true) kommt auch mitten im Zug; dabei keine laufende Animation
  // zurücksetzen.
  function zeige(sichtbar) {
    zeigeElement(abschnitt, sichtbar);

    if (sichtbar) {
      meldeListenerAn();
      return;
    }
    animator?.brichAb();
    schliesseRueckfrage();
    meldeListenerAb();
  }

  function starte(spielstand, eigenerSitz) {
    sitz = eigenerSitz;
    wartetAufAntwort = false;
    letzteMulde = null;
    knopfAufgeben.disabled = false;
    schliesseRueckfrage();

    animator?.brichAb();
    zellen = baueBrett(brettElement, sitz);
    animator = erzeugeAnimator({ brettElement, zellen, sitz });

    zeichneAlles(spielstand);

    stelleFokusWiederHer();
  }

  function beende() {
    knopfAufgeben.disabled = true;
    schliesseRueckfrage();
  }

  // REGEL 3.5: Nach dem Spielende ist niemand mehr am Zug; der Server lässt
  // amZug beim letzten Ziehenden stehen. main.js ruft das erst nach der
  // letzten Animation, damit ein Sonderregel-Hinweis bis dahin sichtbar bleibt.
  function zeigeEnde() {
    setzeText(elemente.zuganzeige, 'Partie beendet');
    schalte(elemente.standEigen, 'stand__spieler--dran', false);
    schalte(elemente.standGegner, 'stand__spieler--dran', false);
    schalte(elemente.zuganzeige, 'zuganzeige--ich', false);
    schalte(elemente.zuganzeige, 'zuganzeige--gegner', false);
    schalte(elemente.zuganzeige, 'zuganzeige--hinweis', false);
  }

  // Punkte und „am Zug“ erst nach der Animation wechseln, Sonderregelhinweis
  // sofort.
  async function spieleZug(bericht, spielstand) {
    if (!zellen || !sitz || !animator) return;

    zeigeSonderregel(bericht);

    const zuEnde = await animator.spiele(bericht, spielstand);

    if (!zuEnde) return;

    zeichneStand(elemente, spielstand, sitz);

    // Ohne Pause wäre der Hinweis vor dem nächsten Browserbild bereits
    // überschrieben.
    if (wenigerBewegung()) zeigeSonderregel(bericht);
    wartetAufAntwort = false;
    stelleFokusWiederHer();
  }

  function melde(text, { ruetteln = false } = {}) {
    wartetAufAntwort = false;
    schalte(brettElement, 'brett--gesperrt', false);
    setzeText(elemente.zuganzeige, text);
    schalte(elemente.zuganzeige, 'zuganzeige--hinweis', true);

    if (ruetteln) {
      ruettleMulden();
    }

    stelleFokusWiederHer();
  }

  return { zeige, starte, beende, zeigeEnde, spieleZug, melde };
}

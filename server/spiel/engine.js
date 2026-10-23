/**
 * engine.js – die Spielregeln auf dem Server.
 *
 * Rechnet einen Zug auf einer Brettkopie und liefert Partie plus Zugbericht.
 * Die übergebene Partie bleibt unverändert; erst handlers.js übernimmt das
 * Ergebnis. Ein abgelehnter Zug hinterlässt so keinen halben Stand.
 *
 * Inhalt:
 *   == 1. Einen Zug ausführen
 *   == 2. Einen Zug prüfen
 *   == 3. Kugeln säen
 *   == 4. Kugeln klauen
 *   == 5. Spielende und Restkugeln
 *   == 6. Ergebnis
 *
 * Benutzt von: Handler, Partie und Tests. Benutzt brett.js und
 * shared/protokoll.js.
 */

import {
  SITZE,
  istSitz,
  kopiereBrett,
  lies,
  setze,
  erhoehe,
  zelleGleich,
  istHaus,
  istInEigenerReihe,
  naechsteZelle,
  gegenueber,
  muldenSumme,
  muldenZellen,
  punkteVon,
  pruefeInvarianten,
  SITZ_NAMEN,
} from './brett.js';
import {
  FEHLER, STATUS, GRUND, GRENZEN, REMIS,
} from '../../shared/protokoll.js';

// == 1. Einen Zug ausführen ==============================================
/** Liefert { ok: true, partie, bericht } oder { ok: false, code }. */
export function fuehreZugAus(partie, sitz, mulde) {
  const pruefung = pruefeZug(partie, sitz, mulde);
  if (!pruefung.ok) return pruefung;

  // ACHTUNG: Der Client braucht brettVorher für seine Zug-Animation.
  const brettVorher = kopiereBrett(partie.brett);
  const brett = kopiereBrett(partie.brett);

  const { letzteZelle, pfad } = saee(brett, sitz, pruefung.zelle);
  const geklaut = klaueKugeln(brett, sitz, letzteZelle);

  // REGEL 3.5: Das Spielende hat Vorrang vor einem möglichen Extrazug.
  const beendet = istSpielende(brett);
  const abrechnung = beendet ? verteileRestkugeln(brett) : null;

  // REGEL 3.3: Im eigenen Haus landen heißt noch einmal ziehen.
  const extrazug = !beendet && zelleGleich(letzteZelle, SITZE[sitz].haus);

  // SCHUTZ: Einen kaputten Zustand zurückweisen, statt ihn weiterzugeben.
  const invarianten = pruefeInvarianten(brett);
  if (!invarianten.ok) {
    return {
      ok: false,
      code: FEHLER.INTERNER_FEHLER,
      verletzungen: invarianten.verletzungen,
    };
  }

  // beute ist der feste Protokollname für das Klauen.
  const bericht = {
    sitz,
    mulde,
    vonZelle: pruefung.zelle,
    pfad,
    extrazug,
    beute: geklaut,
    abrechnung,
    brettVorher,
  };
  return {
    ok: true,
    partie: partieNachZug(partie, brett, sitz, beendet, extrazug),
    bericht,
  };
}

function partieNachZug(partie, brett, sitz, beendet, extrazug) {
  let amZug = SITZE[sitz].gegner;
  if (beendet || extrazug) amZug = sitz;

  return {
    ...partie,
    brett,
    amZug,
    zugNr: partie.zugNr + 1,
    status: beendet ? STATUS.BEENDET : STATUS.LAEUFT,
    ergebnis: beendet ? ergebnisVon(brett, GRUND.REGULAER) : null,
  };
}

// == 2. Einen Zug prüfen =================================================
// SCHUTZ: Wiederholt die Bereichsprüfung aus validation.js, damit die Engine
// auch ohne Handler davor nur gültige Züge rechnet.
export function pruefeZug(partie, sitz, mulde) {
  if (!partie || partie.status !== STATUS.LAEUFT) {
    return { ok: false, code: FEHLER.PARTIE_NICHT_AKTIV };
  }

  if (!istSitz(sitz) || partie.amZug !== sitz) {
    return { ok: false, code: FEHLER.NICHT_AM_ZUG };
  }

  if (!Number.isInteger(mulde)
    || mulde < GRENZEN.MULDE_MIN
    || mulde > GRENZEN.MULDE_MAX) {
    return { ok: false, code: FEHLER.MULDE_UNGUELTIG };
  }

  const zelle = SITZE[sitz].mulde(mulde);

  // SCHUTZ: Auch eine fehlerhafte Sitzabbildung darf kein Haus auswählen.
  if (!istInEigenerReihe(sitz, zelle) || istHaus(zelle)) {
    return { ok: false, code: FEHLER.MULDE_UNGUELTIG };
  }

  if (lies(partie.brett, zelle) < 1) {
    return { ok: false, code: FEHLER.MULDE_LEER };
  }

  return { ok: true, zelle };
}

// == 3. Kugeln säen ======================================================
// REGEL 3.2: Das gegnerische Haus überspringen, das eigene mitzählen.
// Der Animationspfad enthält jeden Einwurf, auch erneut besäte Mulden.
function saee(brett, sitz, startZelle) {
  const gegnerHaus = SITZE[sitz].gegnerHaus;

  let kugeln = lies(brett, startZelle);
  setze(brett, startZelle, 0);

  const pfad = [];
  let zelle = startZelle;

  while (kugeln > 0) {
    zelle = naechsteZelle(zelle);

    if (zelleGleich(zelle, gegnerHaus)) continue;

    erhoehe(brett, zelle);
    kugeln -= 1;
    pfad.push(zelle);
  }

  return { letzteZelle: zelle, pfad };
}

// == 4. Kugeln klauen ====================================================
// REGEL 3.4: Geklaut wird, wenn die letzte Kugel in einer vorher leeren
// eigenen Mulde landet und gegenüber Kugeln liegen; sie kommt mit ins Haus.
// Genau 1 Kugel heißt: Die Mulde war vor der letzten Kugel leer.
// Verändert die Brettkopie.
function klaueKugeln(brett, sitz, letzteZelle) {
  if (!istInEigenerReihe(sitz, letzteZelle)) return null;
  if (istHaus(letzteZelle)) return null;
  if (lies(brett, letzteZelle) !== 1) return null;

  const gegnerZelle = gegenueber(letzteZelle);
  if (lies(brett, gegnerZelle) === 0) return null;

  const anzahl = lies(brett, gegnerZelle) + 1;
  setze(brett, gegnerZelle, 0);
  setze(brett, letzteZelle, 0);
  erhoehe(brett, SITZE[sitz].haus, anzahl);

  return { eigeneZelle: letzteZelle, gegnerZelle, anzahl };
}

// == 5. Spielende und Restkugeln =========================================
function istSpielende(brett) {
  return SITZ_NAMEN.some((sitz) => muldenSumme(brett, SITZE[sitz].reihe) === 0);
}

// REGEL 3.5: Jede Seite bekommt die Restkugeln ihrer eigenen Mulden.
function verteileRestkugeln(brett) {
  const abrechnung = { unten: 0, oben: 0 };

  for (const sitz of SITZ_NAMEN) {
    const reihe = SITZE[sitz].reihe;
    const rest = muldenSumme(brett, reihe);

    erhoehe(brett, SITZE[sitz].haus, rest);
    for (const zelle of muldenZellen(reihe)) {
      setze(brett, zelle, 0);
    }
    abrechnung[sitz] = rest;
  }

  return abrechnung;
}

// == 6. Ergebnis ==========================================================
// REGEL 3.5: Vergleicht die Häuser. Bei Abbruch setzt partie.js den Sieger.
export function ergebnisVon(brett, grund) {
  const punkte = {
    unten: punkteVon(brett, 'unten'),
    oben: punkteVon(brett, 'oben'),
  };

  let sieger = REMIS;
  if (punkte.unten > punkte.oben) sieger = 'unten';
  if (punkte.oben > punkte.unten) sieger = 'oben';

  return { punkte, sieger, grund };
}

/**
 * sicht.test.js – Brettdarstellung für beide Sitze.
 *
 * Client-Drehung und serverseitige Muldennummern müssen übereinstimmen.
 * Sonst kann ein richtig aussehendes Brett die falsche Mulde ansprechen.
 *
 * Inhalt:
 *   == 1. Testaufbau
 *   == 2. Testfälle
 */

// == 1. Testaufbau ==========================================================

import { ausSicht, rolleVon, schluessel, alleZellen } from '../client/js/spiel.js';
import { SITZE } from '../server/spiel/brett.js';

// == 2. Testfälle ===========================================================

describe('ausSicht', () => {
  test('lässt für den Sitz unten alles unverändert', () => {
    for (const zelle of alleZellen()) {
      expect(ausSicht('unten', zelle)).toEqual(zelle);
    }
  });

  test('dreht für den Sitz oben um 180 Grad', () => {
    // eigenes Haus -> unten rechts
    expect(ausSicht('oben', [0, 0])).toEqual([1, 6]);
    // eigene Mulde 0 -> unten links
    expect(ausSicht('oben', [0, 6])).toEqual([1, 0]);
    // eigene Mulde 5 -> neben dem Haus
    expect(ausSicht('oben', [0, 1])).toEqual([1, 5]);
    // gegnerisches Haus -> oben links
    expect(ausSicht('oben', [1, 6])).toEqual([0, 0]);
  });

  test('ist ihre eigene Umkehrung – zweimal gedreht sind 360 Grad', () => {
    // Genau diese Eigenschaft nutzt baueBrett(), um von der Anzeigeposition
    // zurück zur Zelle in der Server-Sicht zu kommen.
    for (const sitz of ['unten', 'oben']) {
      for (const zelle of alleZellen()) {
        expect(ausSicht(sitz, ausSicht(sitz, zelle))).toEqual(zelle);
      }
    }
  });

  test('bildet die 14 Zellen eindeutig ab – nichts fällt zusammen', () => {
    for (const sitz of ['unten', 'oben']) {
      const ziele = new Set(alleZellen().map((z) => ausSicht(sitz, z).join(',')));
      expect(ziele.size).toBe(14);
    }
  });
});

describe('rolleVon', () => {
  test('erkennt bei beiden Sitzen genau ein eigenes und ein gegnerisches Haus', () => {
    for (const sitz of ['unten', 'oben']) {
      const rollen = alleZellen().map((z) => rolleVon(sitz, z));

      const eigeneHaeuser = rollen.filter((r) => r.art === 'haus' && r.seite === 'eigen');
      const fremdeHaeuser = rollen.filter((r) => r.art === 'haus' && r.seite === 'gegner');

      expect(eigeneHaeuser).toHaveLength(1);
      expect(fremdeHaeuser).toHaveLength(1);
    }
  });

  test('vergibt je Seite die Muldennummern 0 bis 5 genau einmal', () => {
    for (const sitz of ['unten', 'oben']) {
      for (const seite of ['eigen', 'gegner']) {
        const nummern = alleZellen()
          .map((z) => rolleVon(sitz, z))
          .filter((r) => r.art === 'mulde' && r.seite === seite)
          .map((r) => r.pos)
          .sort();

        expect(nummern).toEqual([0, 1, 2, 3, 4, 5]);
      }
    }
  });

  test('das eigene Haus des einen ist das gegnerische des anderen', () => {
    const hausVonUnten = alleZellen()
      .find((z) => rolleVon('unten', z).art === 'haus' && rolleVon('unten', z).seite === 'eigen');

    expect(rolleVon('oben', hausVonUnten)).toEqual({
      art: 'haus', seite: 'gegner', pos: null,
    });
  });
});

describe('schluessel', () => {
  test('ist für alle 14 Zellen verschieden', () => {
    const schluesselListe = alleZellen().map(schluessel);
    expect(new Set(schluesselListe).size).toBe(14);
  });
});

describe('Client und Server sind sich einig (die eigentliche Probe)', () => {
  /**
   * Der Server adressiert Mulden über SITZE[sitz].mulde(n), der Client über
   * die Drehung. Wenn beide auseinanderlaufen, klickt ein Spieler auf Mulde 3
   * und der Server bewegt eine andere – ein Fehler, der im Spiel wie ein
   * Regelfehler aussieht und sehr schwer zu finden wäre.
   */
  test('SITZE[sitz].mulde(n) ist für den Client die eigene Mulde n', () => {
    for (const sitz of ['unten', 'oben']) {
      for (let n = 0; n <= 5; n += 1) {
        const zelle = SITZE[sitz].mulde(n);

        expect(rolleVon(sitz, zelle)).toEqual({
          art: 'mulde', seite: 'eigen', pos: n,
        });
      }
    }
  });

  test('dieselbe Zelle ist für den Gegner eine gegnerische Mulde', () => {
    for (const sitz of ['unten', 'oben']) {
      const gegner = SITZE[sitz].gegner;

      for (let n = 0; n <= 5; n += 1) {
        const zelle = SITZE[sitz].mulde(n);
        const rolle = rolleVon(gegner, zelle);

        expect(rolle.art).toBe('mulde');
        expect(rolle.seite).toBe('gegner');
        // Die Muldennummer bleibt gleich, obwohl die Darstellung
        // für den Gegner gedreht wird.
        expect(rolle.pos).toBe(n);
      }
    }
  });

  test('die Häuser der Sitztabelle landen beim Client als Haus', () => {
    for (const sitz of ['unten', 'oben']) {
      expect(rolleVon(sitz, [...SITZE[sitz].haus]).seite).toBe('eigen');
      expect(rolleVon(sitz, [...SITZE[sitz].haus]).art).toBe('haus');

      expect(rolleVon(sitz, [...SITZE[sitz].gegnerHaus]).seite).toBe('gegner');
      expect(rolleVon(sitz, [...SITZE[sitz].gegnerHaus]).art).toBe('haus');
    }
  });
});

/**
 * app.test.js – Express-App: Dateien, Fehlerseite und Sicherheitskopfzeilen.
 *
 * Echte HTTP-Anfragen an einen freien Port prüfen die Auslieferung;
 * Manager und Lobby sind für den Gesundheitsendpunkt einfache Attrappen.
 *
 * Inhalt:
 *   == 1. Testaufbau
 *   == 2. Testfälle
 */

// == 1. Testaufbau ==========================================================

import { erzeugeApp, CSP } from '../server/http/app.js';

/** Attrappen: Der Gesundheitsendpunkt fragt nur nach der Anzahl. */
const manager = { anzahl: () => 0 };
const lobby = { anzahl: () => 0 };

let server;
let basis;

beforeAll(async () => {
  const app = erzeugeApp({ manager, lobby });
  await new Promise((fertig) => {
    server = app.listen(0, '127.0.0.1', fertig);
  });
  basis = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((fertig) => server.close(fertig));
});

// == 2. Testfälle ===========================================================

describe('Schutz gegen Cross-Site-Scripting', () => {
  test('die Startseite schickt die Content-Security-Policy mit', async () => {
    const antwort = await fetch(`${basis}/`);
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('content-security-policy')).toBe(CSP);
  });

  test('die Policy erlaubt Skripte nur vom eigenen Server', () => {
    // Kein 'unsafe-inline' und kein 'unsafe-eval': Inline-Skripte,
    // onclick-Attribute und eval laufen damit nicht.
    expect(CSP).toContain("default-src 'self'");
    expect(CSP).not.toContain('unsafe-inline');
    expect(CSP).not.toContain('unsafe-eval');
  });

  test('auch Skripte, die 404-Seite und shared/ bekommen die Kopfzeilen', async () => {
    for (const pfad of ['/js/main.js', '/shared/protokoll.js', '/gibt-es-nicht']) {
      const antwort = await fetch(`${basis}${pfad}`);
      expect(antwort.headers.get('content-security-policy')).toBe(CSP);
      expect(antwort.headers.get('x-content-type-options')).toBe('nosniff');
    }
  });

  // Geprüft wird die tatsächlich gesendete Kopfzeile, nicht die Konstante:
  // Eine versehentlich abgeschwächte CSP fiele sonst nicht auf.
  test('jede Antwort sperrt Einbettung und fremde Quellen einzeln (Review A6)', async () => {
    const pfade = ['/', '/css/haupt.css', '/js/main.js', '/gesundheit',
      '/gibt-es-nicht'];
    for (const pfad of pfade) {
      const antwort = await fetch(`${basis}${pfad}`);
      const richtlinie = new Map(antwort.headers.get('content-security-policy')
        .split(';')
        .map((teil) => teil.trim().split(/\s+/))
        .map(([name, ...werte]) => [name, werte.join(' ')]));

      expect(richtlinie.get('frame-ancestors')).toBe("'none'");
      expect(richtlinie.get('default-src')).toBe("'self'");
      expect(richtlinie.get('object-src')).toBe("'none'");
      expect(richtlinie.get('base-uri')).toBe("'none'");
      expect(antwort.headers.get('x-frame-options')).toBe('DENY');
    }
  });

  test('die Server-Technik wird nicht verraten', async () => {
    const antwort = await fetch(`${basis}/`);
    expect(antwort.headers.get('x-powered-by')).toBeNull();
  });
});

describe('Auslieferung', () => {
  test('unbekannte Adresse: 404 mit eigener Seite', async () => {
    const antwort = await fetch(`${basis}/gibt-es-nicht`);
    expect(antwort.status).toBe(404);
    expect(await antwort.text()).toContain('Diese Seite gibt es nicht');
  });

  test('der Gesundheitsendpunkt meldet Partien und Wartende', async () => {
    const antwort = await fetch(`${basis}/gesundheit`);
    const daten = await antwort.json();
    expect(daten).toMatchObject({ status: 'ok', partien: 0, wartende: 0 });
  });
});

describe('Fehlerbehandlung', () => {
  test('ein Fehler in einer Anfrage ergibt 500 statt eines Absturzes', async () => {
    // Ein Manager, der beim Zählen wirft – wie ein Programmierfehler.
    const kaputterManager = {
      anzahl() {
        throw new Error('absichtlicher Testfehler');
      },
    };
    const app = erzeugeApp({ manager: kaputterManager, lobby });
    const echtesError = console.error;
    console.error = () => {};   // die erwartete Fehlerzeile nicht ausgeben
    const kaputterServer = await new Promise((fertig) => {
      const s = app.listen(0, '127.0.0.1', () => fertig(s));
    });

    try {
      const adresse = `http://127.0.0.1:${kaputterServer.address().port}`;
      const antwort = await fetch(`${adresse}/gesundheit`);

      expect(antwort.status).toBe(500);
      expect(await antwort.json()).toEqual({ fehler: 'Interner Serverfehler' });
    } finally {
      console.error = echtesError;
      await new Promise((fertig) => kaputterServer.close(fertig));
    }
  });
});

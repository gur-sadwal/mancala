/**
 * Jest-Konfiguration (Konzept 10.2).
 *
 * Das Projekt benutzt echte ES-Module ("type": "module" in package.json). Jest
 * unterstuetzt die nur ueber den VM-Modules-Schalter von Node, der im
 * npm-Skript "test" gesetzt wird. Ein Transpiler (Babel) wird bewusst NICHT
 * eingesetzt: Getestet werden soll genau der Code, der spaeter auch laeuft.
 */
export default {
  testEnvironment: 'node',

  // Leeres transform-Objekt = keine Code-Transformation. Ohne diese Zeile
  // wuerde Jest versuchen, babel-jest zu laden.
  transform: {},

  testMatch: ['**/tests/**/*.test.js'],

  // Abdeckung für den ganzen Servercode und das gemeinsame Protokoll.
  // server/index.js fehlt mit Absicht: Die Datei startet beim Laden sofort
  // einen Server und läuft deshalb nur als eigener Prozess
  // (tests/server.test.js) – was dort passiert, misst Jest nicht.
  collectCoverageFrom: [
    'server/**/*.js',
    '!server/index.js',
    'shared/protokoll.js',
  ],
};

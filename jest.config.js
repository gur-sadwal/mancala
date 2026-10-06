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

  // Abdeckung nur fuer den Servercode, der ohne Netzwerk getestet wird: die
  // Spiel-Engine (Konzept 10.1), die Eingabepruefung und die Handler (mit
  // Attrappen fuer io und Socket, siehe tests/handlers.test.js).
  collectCoverageFrom: [
    'server/spiel/**/*.js',
    'server/socket/validation.js',
    'server/socket/handlers.js',
  ],
};

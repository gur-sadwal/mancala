/**
 * jest.config.js – Tests und Abdeckungsgrenzen.
 *
 * Jest lädt die ES-Module ohne Übersetzer, wie der Server auch.
 * Die Abdeckung enthält den Startpunkt und das gemeinsame Protokoll,
 * damit ungetestete Dateien nicht aus der Messung verschwinden.
 *
 * Inhalt:
 *   == 1. Ausführung und Abdeckung
 */

// == 1. Ausführung und Abdeckung =============================================

export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['server/**/*.js', 'shared/protokoll.js'],
  coverageThreshold: {
    global: { lines: 95 },
    './server/socket/handlers.js': { lines: 90 },
  },
};

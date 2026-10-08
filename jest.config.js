/**
 * Jest prüft die unveränderten ES-Module ohne zusätzlichen Übersetzer.
 * Abdeckung enthält alle Serverdateien einschließlich Startpunkt und Protokoll.
 */
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

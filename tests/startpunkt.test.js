/**
 * Startpunkt mit ersetzten Betriebssystem-Aufrufen: Alle Prozesswächter,
 * Portfehler und das Warten beim Beenden sind ohne echten Prozess prüfbar.
 * tests/server.test.js prüft zusätzlich denselben Einstieg als echten Prozess.
 */
import { jest } from '@jest/globals';

const server = { on: jest.fn(), listen: jest.fn() };
const herunterfahren = jest.fn();
const logger = { info: jest.fn(), error: jest.fn() };
const createServer = jest.fn(() => server);
const erzeugeGateway = jest.fn(() => ({ herunterfahren }));
jest.unstable_mockModule('node:http', () => ({ default: { createServer } }));
jest.unstable_mockModule('../server/socket/gateway.js', () => ({ erzeugeGateway }));
jest.unstable_mockModule('../server/http/app.js', () => ({ erzeugeApp: () => 'App' }));
jest.unstable_mockModule('../server/util/logger.js', () => ({ logger }));

const argvVorher = [...process.argv];
const portVorher = process.env.PORT;
let prozess;
let zeitgeber;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  herunterfahren.mockResolvedValue(undefined);
  prozess = new Map();
  jest.spyOn(process, 'on').mockImplementation((name, handler) => {
    prozess.set(name, handler);
    return process;
  });
  jest.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('Prozessende');
  });
  zeitgeber = { unref: jest.fn() };
  jest.spyOn(globalThis, 'setTimeout').mockReturnValue(zeitgeber);
  process.argv = [argvVorher[0], 'server/index.js'];
  delete process.env.PORT;
});
afterEach(() => {
  jest.restoreAllMocks();
  process.argv = [...argvVorher];
  if (portVorher === undefined) delete process.env.PORT;
  else process.env.PORT = portVorher;
});

async function lade() {
  await import('../server/index.js');
}
function serverfehler(code) {
  return server.on.mock.calls.find(([name]) => name === 'error')[1]({ code });
}

test('setzt Express vor Socket.io auf und bindet ausdrücklich IPv4', async () => {
  process.argv.push('3489');
  await lade();
  expect(createServer).toHaveBeenCalledWith('App');
  expect(createServer.mock.invocationCallOrder[0])
    .toBeLessThan(erzeugeGateway.mock.invocationCallOrder[0]);
  expect(server.listen.mock.calls[0].slice(0, 2)).toEqual([3489, '0.0.0.0']);
  server.listen.mock.calls[0][2]();
  expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('3489'));
});

test('ohne Argument gilt PORT, ohne beides der Standardport', async () => {
  process.env.PORT = '3490';
  await lade();
  expect(server.listen.mock.calls[0][0]).toBe(3490);
  jest.resetModules();
  delete process.env.PORT;
  await lade();
  expect(server.listen.mock.calls[1][0]).toBe(3000);
});

test.each(['abc', '3000abc', '0', '65536', '3.5', ''])('weist ungültigen Port %j zurück', async (port) => {
  process.argv.push(port);
  await expect(lade()).rejects.toThrow('Prozessende');
  expect(process.exit).toHaveBeenCalledWith(1);
  expect(createServer).not.toHaveBeenCalled();
});

test.each(['EADDRINUSE', 'EACCES'])('Startfehler %s ergibt verständliche Meldung und Code1', async (code) => {
  await lade();
  expect(() => serverfehler(code)).toThrow('Prozessende');
  expect(process.exit).toHaveBeenCalledWith(1);
  expect(logger.error).toHaveBeenCalled();
});

test('andere Serverfehler und Prozessfehler werden protokolliert', async () => {
  await lade();
  serverfehler('TEST');
  const fehler = new Error('Absichtlicher Testfehler');
  prozess.get('uncaughtException')(fehler);
  prozess.get('unhandledRejection')(fehler);
  expect(logger.error).toHaveBeenCalledTimes(3);
  expect(process.exit).not.toHaveBeenCalled();
});

test.each(['SIGTERM', 'SIGINT'])('%s wartet auf das Gateway und setzt eine Notbremse', async (signal) => {
  let fertig;
  herunterfahren.mockReturnValue(new Promise((aufloesen) => { fertig = aufloesen; }));
  await lade();
  const ende = prozess.get(signal)();
  expect(process.exit).not.toHaveBeenCalled();
  expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
  expect(zeitgeber.unref).toHaveBeenCalled();
  fertig();
  await expect(ende).rejects.toThrow('Prozessende');
  expect(process.exit).toHaveBeenCalledWith(0);
});

test('auch ein Fehler beim Herunterfahren wird protokolliert und beendet', async () => {
  herunterfahren.mockRejectedValue(new Error('Absichtlicher Testfehler'));
  await lade();
  await expect(prozess.get('SIGTERM')()).rejects.toThrow('Prozessende');
  expect(logger.error).toHaveBeenCalledWith('Herunterfahren fehlgeschlagen', expect.any(Error));
  expect(process.exit).toHaveBeenCalledWith(0);
});

test('die Notbremse beendet nach der Zeitgrenze', async () => {
  herunterfahren.mockReturnValue(new Promise(() => {}));
  await lade();
  prozess.get('SIGTERM')();
  const notbremse = setTimeout.mock.calls[0][0];
  expect(notbremse).toThrow('Prozessende');
  expect(process.exit).toHaveBeenCalledWith(0);
});

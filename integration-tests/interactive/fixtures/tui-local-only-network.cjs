// Loaded with --require before the CLI. Only the fixture's numeric IPv4/port may connect.
const fs = require('node:fs');
const allowedPort = Number(process.env.TUI_MOCK_PORT);
function deny(api, target) {
  const entry = { api, target: String(target), at: Date.now() };
  if (process.env.TUI_NETWORK_LOG)
    fs.appendFileSync(
      process.env.TUI_NETWORK_LOG,
      JSON.stringify(entry) + '\n',
    );
  const error = new Error('TUI fixture blocked non-mock network: ' + api);
  error.code = 'ENETUNREACH';
  throw error;
}
function assertTarget(api, host, port) {
  if (host !== '127.0.0.1' || Number(port) !== allowedPort || !allowedPort)
    deny(api, `${host}:${port}`);
}
const net = require('node:net');
const socketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let first = args[0];
  if (Array.isArray(first)) first = first[0];
  if (typeof first === 'object' && first !== null)
    assertTarget('socket', first.host ?? first.hostname, first.port);
  else
    assertTarget(
      'socket',
      typeof args[1] === 'string' ? args[1] : undefined,
      first,
    );
  return socketConnect.apply(this, args);
};
require('node:tls').connect = (...args) =>
  deny('tls', args[0]?.host ?? args[0]);
for (const name of ['node:http', 'node:https']) {
  const module = require(name);
  for (const method of ['request', 'get']) {
    const original = module[method];
    module[method] = function (...args) {
      const first = args[0];
      if (typeof first === 'string' || first instanceof URL) {
        const url = new URL(first);
        assertTarget(
          name,
          url.hostname,
          url.port || (url.protocol === 'https:' ? 443 : 80),
        );
        if (url.protocol !== 'http:') deny(name, url.protocol);
      } else
        assertTarget(
          name,
          first?.hostname ?? first?.host,
          first?.port ?? (name === 'node:https' ? 443 : 80),
        );
      return original.apply(this, args);
    };
  }
}
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, ...args) => {
  const value =
    typeof input === 'string' || input instanceof URL
      ? String(input)
      : input.url;
  if (value.startsWith('data:')) return originalFetch(input, ...args);
  const url = new URL(value);
  assertTarget(
    'fetch',
    url.hostname,
    url.port || (url.protocol === 'https:' ? 443 : 80),
  );
  if (url.protocol !== 'http:') deny('fetch', url.protocol);
  return originalFetch(input, ...args);
};
const dns = require('node:dns');
for (const key of Object.keys(dns))
  if (/^(lookup|resolve|reverse)/.test(key) && typeof dns[key] === 'function')
    dns[key] = (...args) => deny('dns.' + key, args[0]);
for (const key of Object.keys(dns.promises))
  if (
    /^(lookup|resolve|reverse)/.test(key) &&
    typeof dns.promises[key] === 'function'
  )
    dns.promises[key] = async (...args) => {
      // Vite resolves its default bind hostname during unit-test startup.
      // Answer locally without invoking DNS; socket policy remains unchanged.
      if (key === 'lookup' && args[0] === 'localhost') {
        const address = { address: '127.0.0.1', family: 4 };
        return args[1]?.all ? [address] : address;
      }
      return deny('dns.promises.' + key, args[0]);
    };
require('node:module').syncBuiltinESMExports();

if (process.env.TUI_WRITE_LOG) {
  const originalWrite = process.stdout.write;
  process.stdout.write = function (chunk, ...args) {
    fs.appendFileSync(
      process.env.TUI_WRITE_LOG,
      JSON.stringify({
        kind: 'write',
        at: Date.now(),
        columns: process.stdout.columns,
        rows: process.stdout.rows,
        data: typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(),
      }) + '\n',
    );
    return originalWrite.call(this, chunk, ...args);
  };
  process.stdout.on('resize', () =>
    fs.appendFileSync(
      process.env.TUI_WRITE_LOG,
      JSON.stringify({
        kind: 'resize',
        at: Date.now(),
        columns: process.stdout.columns,
        rows: process.stdout.rows,
      }) + '\n',
    ),
  );
}

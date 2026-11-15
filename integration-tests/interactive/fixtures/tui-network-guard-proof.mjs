import http from 'node:http';
import { log } from 'node:console';
import https from 'node:https';
import tls from 'node:tls';
import net from 'node:net';
import dns from 'node:dns';
import assert from 'node:assert/strict';
let blocked = 0;
for (const check of [
  () => http.get('http://external.invalid'),
  () => https.get('https://external.invalid'),
  () => tls.connect({ host: 'external.invalid', port: 443 }),
  () => net.connect({ host: '203.0.113.1', port: 80 }),
  () => dns.lookup('external.invalid'),
  () => globalThis.fetch('https://external.invalid'),
]) {
  try {
    await check();
    assert.fail('external call unexpectedly allowed');
  } catch (e) {
    assert.equal(e.code, 'ENETUNREACH');
    blocked++;
  }
}
await assert.rejects(dns.promises.lookup('external.invalid'), {
  code: 'ENETUNREACH',
});
blocked++;
log(
  `PASS: ${blocked} external HTTP/HTTPS/TLS/socket/DNS/fetch calls denied before network`,
);

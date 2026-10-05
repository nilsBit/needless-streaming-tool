import { Server as TlsServer } from 'tls';
import type { AddressInfo, Server } from 'net';
import supertest from 'supertest';

/**
 * A test request reaches the server the test started — and no other.
 *
 * This is the fix for issue #22, where the suite failed a few times an hour in
 * a different test each time: a 404 from a route that exists, a request that
 * hung until the timeout, a `Parse Error: Expected HTTP/`.
 *
 * On macOS a socket bound to `::` and one bound to `127.0.0.1` may hold the
 * very same port at once, and the specific one then gets every IPv4
 * connection. Supertest opens a server per request with `listen(0)` — no host,
 * so `::` — and then asks it for `http://127.0.0.1:<port>`. Any program on the
 * machine holding a loopback port can therefore take that traffic over: the
 * app's own dev server, a running Worldbuilder, a stub from another test file.
 * The answer then comes from somewhere else entirely, which is why the failure
 * wandered and never showed up in a single file on its own.
 *
 * So the address is turned around: supertest keeps its `::` socket and is
 * asked over `[::1]`. A socket on `::` blocks any further bind on `::` or
 * `::1`, so that port is this server's alone — while `127.0.0.1` stays open to
 * whoever else wants it.
 *
 * The other direction is covered in the tests themselves: a stub the app is
 * pointed at binds `127.0.0.1` explicitly, because the app builds its URL as
 * `http://127.0.0.1:<port>`. Binding the address it is asked for means the
 * port belongs to the stub alone — a second bind fails and the kernel hands
 * out a free port instead of quietly sharing one.
 *
 * Patched here rather than in the tests because supertest creates that server
 * inside itself, where a test cannot reach it.
 */

interface ServerAddress {
  serverAddress(app: Server, path: string): string;
}

const { Test } = supertest as unknown as { Test: { prototype: ServerAddress } };

Test.prototype.serverAddress = function (this: { _server?: Server }, app: Server, path: string): string {
  // Supertest reads the port right after listen(), so the bind has to stay
  // synchronous — naming a host would put a DNS lookup in front of it.
  if (!app.address()) this._server = app.listen(0);
  const { port } = app.address() as AddressInfo;
  const protocol = app instanceof TlsServer ? 'https' : 'http';
  return `${protocol}://[::1]:${port}${path}`;
};

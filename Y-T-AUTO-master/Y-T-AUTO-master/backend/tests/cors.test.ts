import type { AddressInfo } from 'net';
import app from '../src/index';
import { config } from '../src/config';

describe('credentialed browser API access', () => {
  it('allows the configured frontend origin to send the OAuth binding cookie', async () => {
    const server = app.listen(0, '127.0.0.1');
    try {
      await new Promise<void>((resolve) => server.once('listening', resolve));
      const port = (server.address() as AddressInfo).port;
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/oauth/exchange`, {
        method: 'OPTIONS',
        headers: {
          Origin: config.webOrigin,
          'Access-Control-Request-Method': 'POST',
        },
      });

      expect(response.headers.get('access-control-allow-origin')).toBe(config.webOrigin);
      expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});

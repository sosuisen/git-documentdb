import { Socket } from 'net';
import http from 'http';
import https from 'https';

/**
 * Ping to host
 */
/*
export const ping = (
  port: number,
  address: string,
  timeout: number
): Promise<{ ok: boolean; error?: Error }> => {
  return new Promise(resolve => {
    // Create a new tcp socket
    const socket = new Socket();
    // Connect to the given host
    socket.connect(port, address, () => {
      socket.destroy();
      // Resolve with the latency of this attempt
      resolve({ ok: true });
    });
    // Make sure we catch any errors thrown by the socket
    socket.on('error', error => {
      socket.destroy();
      resolve({ ok: false, error });
    });

    socket.setTimeout(timeout, () => {
      socket.destroy();
      resolve({ ok: false, error: new Error('Request timeout') });
    });
  });
};
*/

/**
 * Check HTTP connection
 */
export const checkHTTP = (
  url: string,
  timeout: number
): Promise<{ ok: boolean; code?: number; error?: Error }> => {
  return new Promise(resolve => {
    // Send GET
    let request: (
      // eslint-disable-next-line node/no-unsupported-features/node-builtins
      options: string | https.RequestOptions | URL,
      callback?: ((res: http.IncomingMessage) => void) | undefined
    ) => http.ClientRequest;
    if (url.startsWith('http:')) {
      request = http.request;
    }
    else if (url.startsWith('https:')) {
      request = https.request;
    }
    else {
      resolve({ ok: false, error: new Error('Invalid protocol') });
    }
    const req = request!(url, res => {
      resolve({ ok: true, code: res.statusCode });
    });
    req.on('error', error => {
      // network error
      req.destroy();
      resolve({ ok: false, error });
    });
    req.setTimeout(timeout, () => {
      req.destroy();
      resolve({ ok: false, error: new Error('Request timeout') });
    });
    req.on('socket', function (socket: Socket) {
      socket.setTimeout(timeout);
      socket.on('timeout', function () {
        req.destroy();
        resolve({ ok: false, error: new Error('Socket timeout') });
      });
    });

    req.end();
  });
};

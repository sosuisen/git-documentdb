/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import { Socket } from 'net';
import http from 'http';
import https from 'https';
import {
  HTTPNetworkError,
  HttpProtocolRequiredError,
  RequestTimeoutError,
  SocketTimeoutError,
} from '../error';

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
 * @remarks
 * requestTimeout and socketTimeout must be greater than 0.
 * Timeout is not set if timeout is less than 0.
 *
 * @internal
 */
export const checkHTTP = (
  url: string,
  requestTimeout: number,
  socketTimeout?: number
): Promise<{ ok: boolean; code?: number; error?: Error }> => {
  // timeout must be greater than 0
  socketTimeout ??= requestTimeout;
  if (requestTimeout === 0) {
    requestTimeout = 1;
  }
  if (socketTimeout === 0) {
    socketTimeout = 1;
  }
  return new Promise((resolve, reject) => {
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
      reject(new HttpProtocolRequiredError(url));
    }

    let socket: Socket;
    const req = request!(url, res => {
      req.removeAllListeners();
      if (socket) {
        socket.removeAllListeners();
      }
      req.destroy();
      resolve({ ok: true, code: res.statusCode });
    });
    req.on('error', error => {
      // network error
      req.removeAllListeners();
      if (socket) {
        socket.removeAllListeners();
      }
      req.destroy();
      reject(new HTTPNetworkError(error.message));
    });

    if (requestTimeout > 0) {
      req.setTimeout(requestTimeout, () => {
        req.removeAllListeners();
        if (socket) {
          socket.removeAllListeners();
        }
        req.destroy();
        console.log(' - request timeout error: ' + requestTimeout);
        reject(new RequestTimeoutError(url));
      });
    }

    if (socketTimeout! > 0) {
      req.on('socket', function (_socket: Socket) {
        socket = _socket;
        socket.setTimeout(socketTimeout!);
        socket.on('timeout', () => {
          req.removeAllListeners();
          if (socket) {
            socket.removeAllListeners();
          }
          req.destroy();
          console.log(' - socket timeout error: ' + socketTimeout);
          reject(new SocketTimeoutError(url));
        });
      });
    }

    req.end();
  });
};

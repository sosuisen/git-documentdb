import {
  HTTPNetworkError,
  HttpProtocolRequiredError,
  RequestTimeoutError,
  SocketTimeoutError,
} from '../src/error';
import { checkHTTP } from '../src/remote/net';

describe('remote: net: ', () => {
  test('check HTTPS connection', async () => {
    await expect(checkHTTP('xyz', 3000)).rejects.toThrowError(HttpProtocolRequiredError);
    const httpUrl = 'http://xyz.invalid/xyz/http_repos';
    await expect(checkHTTP(httpUrl, 3000)).rejects.toThrowError(HTTPNetworkError);
    const httpsUrl = 'https://xyz.invalid/xyz/http_repos';
    await expect(checkHTTP(httpsUrl, 3000)).rejects.toThrowError(HTTPNetworkError);

    const validUrl = 'https://github.com/';
    await expect(checkHTTP(validUrl, 0)).rejects.toThrowError(RequestTimeoutError);
    await expect(checkHTTP(validUrl, -1, 0)).rejects.toThrowError(SocketTimeoutError);
    await expect(checkHTTP(validUrl, 10000)).resolves.toMatchObject({
      ok: true,
      code: 200,
    });
  });
});

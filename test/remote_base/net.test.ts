import expect from 'expect';
import { Err } from '../../src/error';
import { checkHTTP } from '../../src/remote/net';

describe('<remote/net> checkHTTP', () => {
  it('checks HTTPS connection', async () => {
    await expect(checkHTTP('xyz', 3000)).rejects.toThrowError(
      Err.HttpProtocolRequiredError
    );
    const httpUrl = 'http://xyz.invalid/xyz/http_repos';
    await expect(checkHTTP(httpUrl, 3000)).rejects.toThrowError(Err.HTTPNetworkError);
    const httpsUrl = 'https://xyz.invalid/xyz/http_repos';
    await expect(checkHTTP(httpsUrl, 3000)).rejects.toThrowError(Err.HTTPNetworkError);

    const validUrl = 'https://github.com/';
    await expect(checkHTTP(validUrl, 0)).rejects.toThrowError(Err.RequestTimeoutError);
    await expect(checkHTTP(validUrl, -1, 0)).rejects.toThrowError(Err.SocketTimeoutError);
    await expect(checkHTTP(validUrl, 10000)).resolves.toMatchObject({
      ok: true,
      code: 200,
    });
  });
});

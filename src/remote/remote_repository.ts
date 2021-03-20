import { Octokit } from '@octokit/rest';
import { UndefinedPersonalAccessTokenError } from '../error';
import { RemoteAuth } from '../types';

export class RemoteRepository {
  private _remoteURL: string;
  private _auth?: RemoteAuth;
  private _octokit: Octokit | undefined;
  constructor (_remoteURL: string, _auth?: RemoteAuth) {
    this._remoteURL = _remoteURL;
    this._auth = _auth;

    if (this._auth?.type === 'github') {
      this._octokit = new Octokit({
        auth: this._auth.personal_access_token,
      });
    }
  }

  /**
   * Create repository on remote site
   * @remarks
   * auth.type must be 'github'
   */
  async create () {
    if (this._auth?.type === 'github') {
      if (this._auth?.personal_access_token === undefined) {
        throw new UndefinedPersonalAccessTokenError();
      }
      const urlArray = this._remoteURL.split('/');
      const owner = urlArray[urlArray.length - 2];
      const repo = urlArray[urlArray.length - 1];
      await this._octokit!.repos.createForAuthenticatedUser({
        name: repo,
      });
      // May throw HttpError
      // HttpError: Repository creation failed.:
      // {"resource":"Repository","code":"custom","field":"name","message":"name already exists on this account
    }
    else {
      // TODO:
      throw new Error('Cannot create remote repository because auth type is not github');
    }
  }

  /**
   * Delete repository on remote site
   * @remarks
   * auth.type must be 'github'
   */
  async destroy () {
    if (this._auth?.type === 'github') {
      if (this._auth?.personal_access_token === undefined) {
        throw new UndefinedPersonalAccessTokenError();
      }
      const urlArray = this._remoteURL.split('/');
      const owner = urlArray[urlArray.length - 2];
      const repo = urlArray[urlArray.length - 1];
      await this._octokit!.repos.delete({ owner, repo });
    }
  }
}

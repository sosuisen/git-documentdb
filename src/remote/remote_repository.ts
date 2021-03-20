import nodegit from '@sosuisen/nodegit';
import { Octokit } from '@octokit/rest';
import {
  InvalidSSHKeyFormatError,
  InvalidURLFormatError,
  PushAuthenticationError,
  PushPermissionDeniedError,
  RemoteRepositoryNotFoundError,
  UndefinedPersonalAccessTokenError,
  UnresolvedHostError,
} from '../error';
import { RemoteAuth } from '../types';

export class RemoteRepository {
  private _remoteURL: string;
  private _auth?: RemoteAuth;
  private _octokit: Octokit | undefined;

  constructor (remoteURL: string, auth?: RemoteAuth) {
    this._remoteURL = remoteURL;
    this._auth = auth;

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

  /**
   * Get or create Git remote (git remote add)
   * @internal
   */
  // eslint-disable-next-line complexity
  private async _getOrCreateGitRemote (
    repos: nodegit.Repository,
    remoteURL: string
  ): Promise<['add' | 'change' | 'exist', nodegit.Remote]> {
    let result: 'add' | 'change' | 'exist';
    // Check if remote repository already exists
    let remote = await nodegit.Remote.lookup(repos, 'origin').catch(() => {});
    if (remote === undefined) {
      // Add remote repository
      remote = await nodegit.Remote.create(repos, 'origin', remoteURL);
      result = 'add';
    }
    else if (remote.url() !== remoteURL) {
      nodegit.Remote.setUrl(repos, 'origin', remoteURL);
      result = 'change';
    }
    else {
      result = 'exist';
    }
    return [result, remote];
  }

  /**
   * Set a remote repository to a local repository, and the connect to a remote repository.
   * A remote repository will be created if not exists.
   */
  async connect (
    repos: nodegit.Repository,
    credential_callbacks: { [key: string]: any },
    onlyFetch?: boolean
  ) {
    // Get NodeGit.Remote
    const [gitResult, remote] = await this._getOrCreateGitRemote(repos, this._remoteURL);

    // Check fetch and push by NodeGit.Remote
    let remoteResult = await this._checkFetch(remote, credential_callbacks).catch(err => {
      if (err instanceof RemoteRepositoryNotFoundError && this._auth?.type === 'github') {
        return 'create';
      }

      throw err;
    });
    if (remoteResult === 'create') {
      // Try to create repository by octokit
      await this.create().catch(err => {
        // Expected errors:
        //  - The private repository which has the same name exists.
        //  - Authentication error
        //  - Permission error
        throw err;
      });
    }
    else {
      remoteResult = 'exist';
    }
    if (!onlyFetch) {
      await this._checkPush(remote, credential_callbacks);
    }
    return [gitResult, remoteResult];
  }

  /**
   * Check connection by FETCH
   */
  private async _checkFetch (
    remote: nodegit.Remote,
    credential_callbacks: { [key: string]: any }
  ) {
    const remoteURL = remote.url();
    const error = String(
      await remote
        .connect(nodegit.Enums.DIRECTION.FETCH, credential_callbacks)
        .catch(err => err)
    );
    await remote.disconnect();
    if (error !== 'undefined') console.debug('connect fetch error: ' + error);
    switch (true) {
      case error === 'undefined':
        break;
      case error.startsWith('Error: unsupported URL protocol'):
        throw new InvalidURLFormatError(remoteURL);
      case error.startsWith('Error: failed to resolve address'):
        throw new UnresolvedHostError(remoteURL);
      case error.startsWith('Error: request failed with status code: 401'):
      case error.startsWith('Error: request failed with status code: 404'):
      case error.startsWith('Error: Method connect has thrown an error'):
      case error.startsWith('Error: ERROR: Repository not found'):
        // Remote repository does not exist, or you do not have permission to the private repository
        throw new RemoteRepositoryNotFoundError(remoteURL);
      case error.startsWith('Failed to retrieve list of SSH authentication methods'):
        throw new InvalidSSHKeyFormatError();
      default:
        throw new Error(error);
    }
    return 'ok';
  }

  /**
   * Check connection by PUSH
   */
  private async _checkPush (
    remote: nodegit.Remote,
    credential_callbacks: { [key: string]: any }
  ) {
    const error = String(
      await remote
        .connect(nodegit.Enums.DIRECTION.PUSH, credential_callbacks)
        .catch(err => err)
    );
    await remote.disconnect();
    if (error !== 'undefined') console.debug('connect push error: ' + error);
    switch (true) {
      case error === 'undefined':
        break;
      case error.startsWith('Error: request failed with status code: 401'):
        throw new PushAuthenticationError();
      case error.startsWith('Error: ERROR: Permission to'): {
        // Remote repository is read only
        throw new PushPermissionDeniedError();
      }
      default:
        throw new Error(error);
    }
    return 'ok';
  }
}

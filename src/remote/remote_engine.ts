import { Logger } from 'tslog';
import { RemoteOptions } from '../types';

// eslint-disable-next-line @typescript-eslint/naming-convention
export const RemoteEngine: { [key: string]: RemoteEngineInterface } = {};

export interface RemoteEngineInterface {
  checkFetch: (
    workingDir: string,
    options: RemoteOptions,
    remoteName?: string,
    logger?: Logger
  ) => Promise<boolean>;
  fetch: (
    workingDir: string,
    remoteOptions: RemoteOptions,
    remoteName?: string,
    logger?: Logger
  ) => Promise<void>;
  push: (
    workingDir: string,
    remoteOptions: RemoteOptions,
    remoteName?: string,
    localBranch?: string,
    remoteBranch?: string,
    logger?: Logger
  ) => Promise<void>;
  clone: (
    workingDir: string,
    remoteOptions: RemoteOptions,
    logger?: Logger
  ) => Promise<void>;
}

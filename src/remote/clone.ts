/**
 * GitDocumentDB
 * Copyright (c) Hidekazu Kubota
 *
 * This source code is licensed under the Mozilla Public License Version 2.0
 * found in the LICENSE file in the root directory of this source tree.
 */

import nodegit from '@sosuisen/nodegit';
import { Logger } from 'tslog';
import { CannotConnectError } from '../error';
import { sleep } from '../utils';
import { NETWORK_RETRY, NETWORK_RETRY_INTERVAL, NETWORK_TIMEOUT } from '../const';
import { RemoteOptions } from '../types';
import { createCredential } from './authentication';
import { checkHTTP } from './net';

/**
 * Clone repository from remote
 *
 * @throws {@link CannotConnectError}
 *
 */
export async function cloneRepository (
  workingDir: string,
  remoteOptions: RemoteOptions,
  logger?: Logger
) {
  logger ??= new Logger({
    name: 'clone',
    minLevel: 'trace',
    displayDateTime: false,
    displayFunctionName: false,
    displayFilePath: 'hidden',
  });
  if (
    remoteOptions !== undefined &&
    remoteOptions.remoteUrl !== undefined &&
    remoteOptions.remoteUrl !== ''
  ) {
    /**
     * Retry if network errors.
     */
    let result: {
      ok: boolean;
      code?: number;
      error?: Error;
    } = {
      ok: false,
    };
    let retry = 0;
    for (; retry < NETWORK_RETRY; retry++) {
      // eslint-disable-next-line no-await-in-loop
      result = await checkHTTP(remoteOptions.remoteUrl!, NETWORK_TIMEOUT).catch(err => err);
      if (result.ok) {
        break;
      }
      else {
        logger.debug(`NetworkError in cloning: ${remoteOptions.remoteUrl}, ` + result);
      }
      // eslint-disable-next-line no-await-in-loop
      await sleep(NETWORK_RETRY_INTERVAL);
    }
    if (!result.ok) {
      // Set retry number for code test
      throw new CannotConnectError(retry, remoteOptions.remoteUrl, result.toString());
    }

    return await nodegit.Clone.clone(remoteOptions.remoteUrl, workingDir, {
      fetchOpts: {
        callbacks: createCredential(remoteOptions),
      },
    }).catch(err => {
      // Errors except CannotConnectError are handled in sync().
      logger!.debug(`Error in cloning: ${remoteOptions.remoteUrl}, ` + err);
      // The db will try to create remote repository in sync() if 'undefined' is returned.
      return undefined;
    });
  }

  return undefined;
}

import nodegit from '@sosuisen/nodegit';
import { JsonDiff } from './remote/json_diff';
import {
  IJsonPatch,
  RemoteOptions,
  SyncActiveCallback,
  SyncCallback,
  SyncChangeCallback,
  SyncCombineDatabaseCallback,
  SyncCompleteCallback,
  SyncErrorCallback,
  SyncEvent,
  SyncLocalChangeCallback,
  SyncPausedCallback,
  SyncRemoteChangeCallback,
  SyncResult,
  SyncResultCancel,
  SyncResultPush,
  SyncStartCallback,
} from './types';

/**
 * Interface of Sync
 */
export interface ISync {
  currentRetries(): number;
  eventHandlers: {
    change: SyncChangeCallback[];
    localChange: SyncLocalChangeCallback[];
    remoteChange: SyncRemoteChangeCallback[];
    combine: SyncCombineDatabaseCallback[];
    paused: SyncPausedCallback[];
    active: SyncActiveCallback[];
    start: SyncStartCallback[];
    complete: SyncCompleteCallback[];
    error: SyncErrorCallback[];
  };
  jsonDiff: JsonDiff;
  jsonPatch: IJsonPatch;
  upstream_branch: string;
  credential_callbacks: { [key: string]: any };
  author: nodegit.Signature;
  committer: nodegit.Signature;
  remoteURL(): string;
  options(): RemoteOptions;
  tryPush(): Promise<SyncResultPush | SyncResultCancel>;
  trySync(): Promise<SyncResult>;
  enqueuePushTask(): Promise<SyncResultPush | SyncResultCancel>;
  enqueueSyncTask(): Promise<SyncResult>;
  on(event: SyncEvent, callback: SyncCallback): void;
  off(event: SyncEvent, callback: SyncCallback): void;
  pause(): void;
  cancel(): void;
  resume(options?: { interval?: number; retry?: number }): void;
}

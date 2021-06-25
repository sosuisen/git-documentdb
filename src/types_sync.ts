import { JsonDiff } from './remote/json_diff';
import {
  IJsonPatch,
  RemoteOptions,
  SyncCallback,
  SyncChangeCallback,
  SyncCombineDatabaseCallback,
  SyncCompleteCallback,
  SyncErrorCallback,
  SyncEvent,
  SyncLocalChangeCallback,
  SyncPauseCallback,
  SyncRemoteChangeCallback,
  SyncResult,
  SyncResultCancel,
  SyncResultPush,
  SyncResumeCallback,
  SyncStartCallback,
} from './types';

/**
 * Interface of Sync
 */
export interface ISync {
  currentRetries(): number;
  eventHandlers: {
    change: { collectionPath: string; func: SyncChangeCallback }[];
    localChange: { collectionPath: string; func: SyncLocalChangeCallback }[];
    remoteChange: { collectionPath: string; func: SyncRemoteChangeCallback }[];
    combine: { collectionPath: string; func: SyncCombineDatabaseCallback }[];
    pause: { collectionPath: string; func: SyncPauseCallback }[];
    resume: { collectionPath: string; func: SyncResumeCallback }[];
    start: { collectionPath: string; func: SyncStartCallback }[];
    complete: { collectionPath: string; func: SyncCompleteCallback }[];
    error: { collectionPath: string; func: SyncErrorCallback }[];
  };
  jsonDiff: JsonDiff;
  jsonPatch: IJsonPatch;
  upstreamBranch: string;
  credentialCallbacks: { [key: string]: any };
  remoteURL(): string;
  options(): RemoteOptions;
  tryPush(): Promise<SyncResultPush | SyncResultCancel>;
  trySync(): Promise<SyncResult>;
  enqueuePushTask(): Promise<SyncResultPush | SyncResultCancel>;
  enqueueSyncTask(): Promise<SyncResult>;
  on(event: SyncEvent, callback: SyncCallback, collectionPath?: string): ISync;
  off(event: SyncEvent, callback: SyncCallback): void;
  pause(): void;
  resume(options?: { interval?: number; retry?: number }): void;
}

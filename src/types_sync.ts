import { JsonDiff } from './remote/json_diff';
import { RemoteRepository } from './remote/remote_repository';
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
 *
 * @public
 */
export interface SyncInterface {
  /***********************************************
   * Public properties (readonly)
   ***********************************************/
  remoteURL: string;
  engine: string;
  remoteRepository: RemoteRepository;
  options: RemoteOptions;
  remoteName: string;

  /***********************************************
   * Public properties
   ***********************************************/
  /**
   * @internal
   */
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

  /***********************************************
   * Public methods
   ***********************************************/
  init(): Promise<SyncResult>;

  pause(): void;
  resume(options?: { interval?: number; retry?: number }): void;
  close(): void;

  tryPush(): Promise<SyncResultPush | SyncResultCancel>;
  trySync(): Promise<SyncResult>;

  currentRetries(): number;

  on(event: SyncEvent, callback: SyncCallback, collectionPath?: string): SyncInterface;
  off(event: SyncEvent, callback: SyncCallback): SyncInterface;
}

/**
 * Interface for SyncEvent
 *
 * @public
 */
export interface SyncEventInterface {
  onSyncEvent(remoteURL: string, event: SyncEvent, callback: SyncCallback): SyncInterface;
  onSyncEvent(sync: SyncInterface, event: SyncEvent, callback: SyncCallback): SyncInterface;
  /**
   * @internal
   */
  onSyncEvent(
    remoteURLorSync: string | SyncInterface,
    event: SyncEvent,
    callback: SyncCallback
  ): SyncInterface;

  offSyncEvent(remoteURL: string, event: SyncEvent, callback: SyncCallback): void;
  offSyncEvent(sync: SyncInterface, event: SyncEvent, callback: SyncCallback): void;
  /**
   * @internal
   */
  offSyncEvent(
    remoteURLorSync: string | SyncInterface,
    event: SyncEvent,
    callback: SyncCallback
  ): void;
}

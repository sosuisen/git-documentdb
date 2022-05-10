---
sidebar_label: git-documentdb package
title: git-documentdb package
hide_title: true
---

[Home](./index.md) &gt; [git-documentdb](./git-documentdb.md)

## git-documentdb package

Offline-first Database that Syncs with Git

## Classes

|  Class | Description |
|  --- | --- |
|  [Collection](./git-documentdb.collection.md) | Documents under a collectionPath are gathered together in a collection. |
|  [GitDocumentDB](./git-documentdb.gitdocumentdb.md) | Main class of GitDocumentDB |
|  [RemoteRepository](./git-documentdb.remoterepository.md) | Remote repository class |
|  [Sync](./git-documentdb.sync.md) | Synchronizer class |
|  [TaskQueue](./git-documentdb.taskqueue.md) | TaskQueue |
|  [Validator](./git-documentdb.validator.md) | Validator Class |

## Functions

|  Function | Description |
|  --- | --- |
|  [encodeToGitRemoteName(remoteURL)](./git-documentdb.encodetogitremotename.md) | encodeToGitRemoteName |

## Interfaces

|  Interface | Description |
|  --- | --- |
|  [CollectionInterface](./git-documentdb.collectioninterface.md) | Interface for Collection |
|  [CRUDInterface](./git-documentdb.crudinterface.md) | Interface for GitDocumentDB CRUD |
|  [GitDDBInterface](./git-documentdb.gitddbinterface.md) | Interface of GitDocumentDB body |
|  [SyncEventInterface](./git-documentdb.synceventinterface.md) | Interface for SyncEvent |
|  [SyncInterface](./git-documentdb.syncinterface.md) | Interface of Sync |

## Namespaces

|  Namespace | Description |
|  --- | --- |
|  [Err](./git-documentdb.err.md) | Namespace for errors |
|  [RemoteErr](./git-documentdb.remoteerr.md) | RemoteError |

## Variables

|  Variable | Description |
|  --- | --- |
|  [DATABASE\_CREATOR](./git-documentdb.database_creator.md) |  |
|  [DATABASE\_VERSION](./git-documentdb.database_version.md) |  |
|  [DEFAULT\_COMBINE\_DB\_STRATEGY](./git-documentdb.default_combine_db_strategy.md) |  |
|  [DEFAULT\_CONFLICT\_RESOLUTION\_STRATEGY](./git-documentdb.default_conflict_resolution_strategy.md) |  |
|  [DEFAULT\_LOCAL\_DIR](./git-documentdb.default_local_dir.md) |  |
|  [DEFAULT\_LOG\_LEVEL](./git-documentdb.default_log_level.md) |  |
|  [DEFAULT\_SYNC\_INTERVAL](./git-documentdb.default_sync_interval.md) |  |
|  [DUPLICATED\_FILE\_POSTFIX](./git-documentdb.duplicated_file_postfix.md) |  |
|  [FILE\_CREATE\_TIMEOUT](./git-documentdb.file_create_timeout.md) |  |
|  [FILE\_REMOVE\_TIMEOUT](./git-documentdb.file_remove_timeout.md) |  |
|  [FIRST\_COMMIT\_MESSAGE](./git-documentdb.first_commit_message.md) |  |
|  [FRONT\_MATTER\_POSTFIX](./git-documentdb.front_matter_postfix.md) |  |
|  [GIT\_DOCUMENTDB\_INFO\_ID](./git-documentdb.git_documentdb_info_id.md) |  |
|  [GIT\_DOCUMENTDB\_METADATA\_DIR](./git-documentdb.git_documentdb_metadata_dir.md) |  |
|  [JSON\_POSTFIX](./git-documentdb.json_postfix.md) |  |
|  [MAX\_FILE\_PATH\_LENGTH](./git-documentdb.max_file_path_length.md) |  |
|  [MINIMUM\_SYNC\_INTERVAL](./git-documentdb.minimum_sync_interval.md) |  |
|  [NETWORK\_RETRY\_INTERVAL](./git-documentdb.network_retry_interval.md) |  |
|  [NETWORK\_RETRY](./git-documentdb.network_retry.md) |  |
|  [NETWORK\_TIMEOUT](./git-documentdb.network_timeout.md) |  |
|  [PUT\_APP\_INFO\_MESSAGE](./git-documentdb.put_app_info_message.md) |  |
|  [RemoteEngine](./git-documentdb.remoteengine.md) | RemoteEngine |
|  [SET\_DATABASE\_ID\_MESSAGE](./git-documentdb.set_database_id_message.md) |  |
|  [SHORT\_SHA\_LENGTH](./git-documentdb.short_sha_length.md) |  |
|  [YAML\_POSTFIX](./git-documentdb.yaml_postfix.md) |  |

## Type Aliases

|  Type Alias | Description |
|  --- | --- |
|  [AcceptedConflict](./git-documentdb.acceptedconflict.md) | Accepted conflict |
|  [BinaryDocMetadata](./git-documentdb.binarydocmetadata.md) | Metadata for BinaryDoc |
|  [ChangedFile](./git-documentdb.changedfile.md) | Union type of changed files in a merge operation |
|  [ChangedFileDelete](./git-documentdb.changedfiledelete.md) | Deleted file in a merge operation |
|  [ChangedFileInsert](./git-documentdb.changedfileinsert.md) | Inserted file in a merge operation |
|  [ChangedFileUpdate](./git-documentdb.changedfileupdate.md) | Updated file in a merge operation |
|  [CollectionOptions](./git-documentdb.collectionoptions.md) | Options for Collection constructor |
|  [CollectionPath](./git-documentdb.collectionpath.md) | CollectionPath |
|  [CombineDbStrategies](./git-documentdb.combinedbstrategies.md) | Behavior when combining inconsistent DBs Default is 'combine-head-with-theirs'. |
|  [ConflictResolutionStrategies](./git-documentdb.conflictresolutionstrategies.md) | Strategy for resolving conflicts |
|  [ConflictResolutionStrategyLabels](./git-documentdb.conflictresolutionstrategylabels.md) |  |
|  [ConnectionSettings](./git-documentdb.connectionsettings.md) | Connection settings for RemoteOptions |
|  [ConnectionSettingsGitHub](./git-documentdb.connectionsettingsgithub.md) | Connection settings for GitHub |
|  [ConnectionSettingsNone](./git-documentdb.connectionsettingsnone.md) | Connection settings do not exist. |
|  [ConnectionSettingsSSH](./git-documentdb.connectionsettingsssh.md) | Connection settings for SSH |
|  [DatabaseCloseOption](./git-documentdb.databasecloseoption.md) | How to close a database |
|  [DatabaseInfo](./git-documentdb.databaseinfo.md) | Database information |
|  [DatabaseOpenResult](./git-documentdb.databaseopenresult.md) | Result of opening database |
|  [DatabaseOptions](./git-documentdb.databaseoptions.md) | Database Options |
|  [DeleteOptions](./git-documentdb.deleteoptions.md) | Options for delete |
|  [DeleteResult](./git-documentdb.deleteresult.md) | Result of delete() |
|  [DeleteResultBinary](./git-documentdb.deleteresultbinary.md) |  |
|  [DeleteResultJsonDoc](./git-documentdb.deleteresultjsondoc.md) |  |
|  [DeleteResultText](./git-documentdb.deleteresulttext.md) |  |
|  [Doc](./git-documentdb.doc.md) | Union type of Doc types |
|  [DocMetadata](./git-documentdb.docmetadata.md) | Union type of Document metadata |
|  [DocType](./git-documentdb.doctype.md) | Type of document |
|  [DuplicatedFile](./git-documentdb.duplicatedfile.md) | Duplicated file in combining operation |
|  [FatBinaryDoc](./git-documentdb.fatbinarydoc.md) | Binary (Uint8Array) with metadata |
|  [FatDoc](./git-documentdb.fatdoc.md) | Union type of documents with a metadata |
|  [FatJsonDoc](./git-documentdb.fatjsondoc.md) | JsonDoc with metadata |
|  [FatTextDoc](./git-documentdb.fattextdoc.md) | Text (string) with metadata |
|  [FindOptions](./git-documentdb.findoptions.md) | Options for find and findFatDoc |
|  [GetOptions](./git-documentdb.getoptions.md) | Options for get APIs (get, getFatDoc, getOldRevision, getFatDocOldRevision, getHistory, getFatDocHistory) |
|  [HistoryFilter](./git-documentdb.historyfilter.md) | Filter for file history |
|  [HistoryOptions](./git-documentdb.historyoptions.md) | Options for getHistory() and getFatDocHistory() |
|  [ICollection](./git-documentdb.icollection.md) | Type for Collection Class |
|  [JsonDiffPatchOptions](./git-documentdb.jsondiffpatchoptions.md) | JsonDiffPatchOptions |
|  [JsonDoc](./git-documentdb.jsondoc.md) | The type for a JSON document that is stored in a database |
|  [JsonDocMetadata](./git-documentdb.jsondocmetadata.md) | Metadata for JsonDoc |
|  [NormalizedCommit](./git-documentdb.normalizedcommit.md) | Normalized Commit |
|  [OpenOptions](./git-documentdb.openoptions.md) | Database open options |
|  [PluginTypes](./git-documentdb.plugintypes.md) | Plugin types |
|  [PutOptions](./git-documentdb.putoptions.md) | Options for put APIs (put, update, insert, putFatDoc, updateFatDoc, and insertFatDoc) |
|  [PutResult](./git-documentdb.putresult.md) | Result of put APIs (put, update, insert, putFatDoc, updateFatDoc, and insertFatDoc) |
|  [PutResultBinary](./git-documentdb.putresultbinary.md) |  |
|  [PutResultJsonDoc](./git-documentdb.putresultjsondoc.md) |  |
|  [PutResultText](./git-documentdb.putresulttext.md) |  |
|  [RemoteOptions](./git-documentdb.remoteoptions.md) | Options for Sync class |
|  [Schema](./git-documentdb.schema.md) | Schema for specific document type |
|  [SerializeFormatLabel](./git-documentdb.serializeformatlabel.md) | Format for serialization |
|  [SyncCallback](./git-documentdb.synccallback.md) | Union type of SyncEventCallbacks |
|  [SyncChangeCallback](./git-documentdb.syncchangecallback.md) | Callback of 'change' event |
|  [SyncCombineDatabaseCallback](./git-documentdb.synccombinedatabasecallback.md) | Callback of 'combine' event |
|  [SyncCompleteCallback](./git-documentdb.synccompletecallback.md) | Callback of 'complete' event |
|  [SyncDirection](./git-documentdb.syncdirection.md) | Synchronization direction |
|  [SyncErrorCallback](./git-documentdb.syncerrorcallback.md) | Callback of 'error' event |
|  [SyncEvent](./git-documentdb.syncevent.md) | Union type of SyncEvents |
|  [SyncLocalChangeCallback](./git-documentdb.synclocalchangecallback.md) | Callback of 'localChange' event |
|  [SyncPauseCallback](./git-documentdb.syncpausecallback.md) | Callback of 'pause' event |
|  [SyncRemoteChangeCallback](./git-documentdb.syncremotechangecallback.md) | Callback of 'remoteChange' event |
|  [SyncResult](./git-documentdb.syncresult.md) | Union type of results from trySync() and tryPush() |
|  [SyncResultCancel](./git-documentdb.syncresultcancel.md) | Synchronization was canceled. |
|  [SyncResultCombineDatabase](./git-documentdb.syncresultcombinedatabase.md) | Synchronization combined databases. |
|  [SyncResultFastForwardMerge](./git-documentdb.syncresultfastforwardmerge.md) | Synchronization invoked fast-forward merge. |
|  [SyncResultMergeAndPush](./git-documentdb.syncresultmergeandpush.md) | Synchronization created a merge commit and pushed it. |
|  [SyncResultMergeAndPushError](./git-documentdb.syncresultmergeandpusherror.md) | Synchronization created a merge commit and failed to push it. |
|  [SyncResultNop](./git-documentdb.syncresultnop.md) | Synchronization did nothing. |
|  [SyncResultPush](./git-documentdb.syncresultpush.md) | Synchronization pushed commits. |
|  [SyncResultResolveConflictsAndPush](./git-documentdb.syncresultresolveconflictsandpush.md) | Synchronization resolved conflicts, created a merge commit, and pushed it. |
|  [SyncResultResolveConflictsAndPushError](./git-documentdb.syncresultresolveconflictsandpusherror.md) | Synchronization resolved conflicts, created a merge commit, and failed to push it. |
|  [SyncResumeCallback](./git-documentdb.syncresumecallback.md) | Callback of 'resume' event |
|  [SyncStartCallback](./git-documentdb.syncstartcallback.md) | Callback of 'start' event |
|  [TaskLabel](./git-documentdb.tasklabel.md) | Union type of properties of TaskStatistics |
|  [TaskMetadata](./git-documentdb.taskmetadata.md) | Metadata of a task |
|  [TaskStatistics](./git-documentdb.taskstatistics.md) | Task statistics after opening database |
|  [TextDocMetadata](./git-documentdb.textdocmetadata.md) | Metadata for TextDoc |
|  [WriteOperation](./git-documentdb.writeoperation.md) | Write operation in resolving conflicts |


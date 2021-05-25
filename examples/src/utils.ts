import { SyncResult } from "git-documentdb";

export function showChanges (syncResult: SyncResult, localLabel: string) {
  console.log(syncResult.action + ' action on ' + localLabel);

  if (syncResult.action === 'fast-forward merge' ||
    syncResult.action === 'merge and push' ||
    syncResult.action === 'merge and push error' ||
    syncResult.action === 'resolve conflicts and push' ||
    syncResult.action === 'resolve conflicts and push error'){
      syncResult.changes.local.forEach(file => {
        if (file.operation === 'delete' || file.operation === 'update')
          console.log(' - ' + file.operation + ' ' + JSON.stringify(file.old.doc) + ' on ' + localLabel);
        if (file.operation === 'insert' || file.operation === 'update')
          console.log(' - ' + file.operation + ' ' + JSON.stringify(file.new.doc) + ' on ' + localLabel);
      });
    }

  if (syncResult.action === 'push' ||
    syncResult.action === 'merge and push' ||
    syncResult.action === 'resolve conflicts and push') {
    syncResult.changes.remote.forEach(file => {
      if (file.operation === 'delete' || file.operation === 'update')
        console.log(' - ' + file.operation + ' ' + JSON.stringify(file.old.doc) + ' on GitHub');
      if (file.operation === 'insert' || file.operation === 'update')
        console.log(' - ' + file.operation + ' ' + JSON.stringify(file.new.doc) + ' on GitHub');
    });
  }
}

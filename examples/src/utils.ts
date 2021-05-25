import { SyncResult } from "git-documentdb";

export const sleep = (msec: number) => new Promise(resolve => setTimeout(resolve, msec));

export function showChanges (syncResult: SyncResult, localLabel: string) {
  console.log('');
  console.log('[sync change (' + syncResult.action + ') on ' + localLabel + ']');

  if (syncResult.action === 'fast-forward merge' ||
    syncResult.action === 'merge and push' ||
    syncResult.action === 'merge and push error' ||
    syncResult.action === 'resolve conflicts and push' ||
    syncResult.action === 'resolve conflicts and push error'){
    syncResult.changes.local.forEach(file => {
      if (file.operation === 'insert')
        console.log(' - insert ' + JSON.stringify(file.new.doc) + ' on ' + localLabel);
      if (file.operation === 'delete')
        console.log(' - delete ' + JSON.stringify(file.old.doc) + ' on ' + localLabel);
      if(file.operation === 'update') {
        console.log(' - update from ' + JSON.stringify(file.old.doc));
        console.log('            to ' + JSON.stringify(file.new.doc) + ' on ' + localLabel);        
      }
    });
  }

  if (syncResult.action === 'push' ||
    syncResult.action === 'merge and push' ||
    syncResult.action === 'resolve conflicts and push') {
    syncResult.changes.remote.forEach(file => {
      if (file.operation === 'insert')
        console.log(' - insert ' + JSON.stringify(file.new.doc) + ' on GitHub');
      if (file.operation === 'delete')
        console.log(' - delete ' + JSON.stringify(file.old.doc) + ' on GitHub');
      if(file.operation === 'update') {
        console.log(' - update from ' + JSON.stringify(file.old.doc));
        console.log('            to ' + JSON.stringify(file.new.doc) + ' on GitHub');        
      }
    });
  }
  console.log('');  
}

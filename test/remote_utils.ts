import { Octokit } from '@octokit/rest';

const token = process.env.GITDDB_PERSONAL_ACCESS_TOKEN!;

export async function removeRemoteRepositories (reposPrefix: string) {
  // Remove test repositories on remote
  console.log('Removing remote repositories..');
  const octokit = new Octokit({
    auth: token,
  });
  const promises: Promise<any>[] = [];
  let len = 0;
  do {
    // eslint-disable-next-line no-await-in-loop
    const reposArray = await octokit.repos.listForAuthenticatedUser({ per_page: 100 });
    len = reposArray.data.length;
    reposArray.data.forEach(repos => {
      if (repos) {
        const urlArray = repos.full_name.split('/');
        const owner = urlArray[0];
        const repo = urlArray[1];
        if (repo.startsWith(reposPrefix)) {
          console.log('removing remote: ' + repos.full_name);
          promises.push(
            octokit.repos.delete({ owner, repo }).catch(err => {
              if (err.status !== 404) {
                console.debug(err);
              }
            })
          );
        }
      }
    });
  } while (len === 100);
  await Promise.all(promises);
}

// Publish files to a dedicated branch (default `data`) without touching the
// checked-out working tree: a temporary git worktree does the work.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, normalize } from 'node:path';

const run = promisify(execFile);
const BOT = ['-c', 'user.name=set-digest-bot', '-c', 'user.email=set-digest-bot@users.noreply.github.com'];

const git = (cwd, ...args) => run('git', [...BOT, ...args], { cwd });

function assertSafePath(p) {
  const n = normalize(p);
  if (isAbsolute(p) || n.startsWith('..') || n.split(/[\\/]/).includes('..')) {
    throw new Error(`Unsafe file path: ${p}`);
  }
}

export async function publishToDataBranch({ repoDir, files, message, branch = 'data', remote = 'origin' }) {
  for (const p of Object.keys(files)) assertSafePath(p);

  const remoteRef = `refs/remotes/${remote}/${branch}`;
  let exists = true;
  try {
    await git(repoDir, 'fetch', remote, `+refs/heads/${branch}:${remoteRef}`);
  } catch {
    exists = false; // branch not on the remote yet
  }

  const tmp = await mkdtemp(join(tmpdir(), 'publish-'));
  const wt = join(tmp, 'wt');
  try {
    await git(repoDir, 'worktree', 'add', '--detach', wt, exists ? remoteRef : 'HEAD');
    if (!exists) {
      await git(wt, 'checkout', '--orphan', `${branch}-orphan`);
      await git(wt, 'rm', '-rf', '--quiet', '.');
    }
    for (const [p, content] of Object.entries(files)) {
      const target = join(wt, p);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    await git(wt, 'add', '-A');
    try {
      await git(wt, 'diff', '--cached', '--quiet');
      return; // nothing changed: no empty commit
    } catch {
      // diff --quiet exits 1 when there are staged changes: proceed to commit
    }
    await git(wt, 'commit', '-m', message);
    await git(wt, 'push', remote, `HEAD:refs/heads/${branch}`);
  } finally {
    await git(repoDir, 'worktree', 'remove', '--force', wt).catch(() => {});
    await rm(tmp, { recursive: true, force: true });
  }
}

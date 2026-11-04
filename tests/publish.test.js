import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishToDataBranch } from '../src/publish.js';

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' }).trim();

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'publish-test-'));
  const remote = join(root, 'remote.git');
  const work = join(root, 'work');
  git(root, 'init', '--bare', '-b', 'main', remote);
  git(root, 'init', '-b', 'main', work);
  writeFileSync(join(work, 'README.md'), 'hello\n');
  git(work, 'add', '-A');
  git(work, 'commit', '-m', 'init');
  git(work, 'remote', 'add', 'origin', remote);
  git(work, 'push', 'origin', 'main');
  return { work, remote };
}

test('creates the data branch, adds files across calls, leaves the working tree alone', async () => {
  const { work, remote } = fixture();
  await publishToDataBranch({ repoDir: work, files: { 'reports/2026-11-04.md': '# r1\n' }, message: 'first' });
  await publishToDataBranch({ repoDir: work, files: { 'state/state.json': '{}\n' }, message: 'second' });

  assert.equal(git(remote, 'rev-list', '--count', 'data'), '2');
  assert.equal(git(remote, 'show', 'data:reports/2026-11-04.md'), '# r1');
  assert.equal(git(remote, 'show', 'data:state/state.json'), '{}');
  assert.equal(git(work, 'branch', '--show-current'), 'main');
  assert.equal(git(work, 'status', '--porcelain'), '');
  assert.equal(existsSync(join(work, 'reports')), false);
});

test('publishing identical content again creates no empty commit', async () => {
  const { work, remote } = fixture();
  const files = { 'a.txt': 'same\n' };
  await publishToDataBranch({ repoDir: work, files, message: 'one' });
  await publishToDataBranch({ repoDir: work, files, message: 'two' });
  assert.equal(git(remote, 'rev-list', '--count', 'data'), '1');
});

test('later publish updates an existing file', async () => {
  const { work, remote } = fixture();
  await publishToDataBranch({ repoDir: work, files: { 'a.txt': 'v1\n' }, message: 'v1' });
  await publishToDataBranch({ repoDir: work, files: { 'a.txt': 'v2\n' }, message: 'v2' });
  assert.equal(git(remote, 'show', 'data:a.txt'), 'v2');
});

test('rejects paths that escape the branch root', async () => {
  const { work } = fixture();
  await assert.rejects(() => publishToDataBranch({ repoDir: work, files: { '../evil.txt': 'x' }, message: 'm' }), /path/i);
  await assert.rejects(() => publishToDataBranch({ repoDir: work, files: { '/abs.txt': 'x' }, message: 'm' }), /path/i);
});

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
const { stdout } = await promisify(execFile)(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
);
const paths = stdout.split('\0').filter(Boolean);
const failures = [];
for (const path of paths) {
  if (
    /\.(pdf|xlsx|xlsm|key|pem)$/i.test(path) ||
    /(?:recovery.key|encrypted.backup).*\.(txt|json)$/i.test(path) ||
    (/\.env/.test(path) && path !== '.env.example')
  ) {
    failures.push(path);
    continue;
  }
  const content = readFileSync(path, 'utf8');
  if (/sb_secret_[A-Za-z0-9_-]{20,}/.test(content)) failures.push(path);
  for (const token of content.match(
    /[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  ) ?? []) {
    try {
      if (
        JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
          .role === 'service_role'
      )
        failures.push(path);
    } catch {
      /* Not a JWT. */
    }
  }
}
if (failures.length) {
  console.error(
    'Private files or administrator credentials detected in: ' +
      [...new Set(failures)].join(', '),
  );
  process.exit(1);
}
console.log(
  'Repository check passed: no statement binaries, environment secrets, recovery backups, or administrator keys detected.',
);

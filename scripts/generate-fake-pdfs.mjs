import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
const built = await build({
  entryPoints: ['tests/pdf-fixtures.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { syntheticPdf } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(built.outputFiles[0].contents).toString('base64')
);
const destination = 'private-data/fake-statements';
await mkdir(destination, { recursive: true });
for (const account of ['Amex', 'Capital One', 'Bank of America']) {
  const name = account.toLowerCase().replaceAll(' ', '-');
  await writeFile(
    `${destination}/synthetic-${name}.pdf`,
    await syntheticPdf(account),
  );
}
await writeFile(
  `${destination}/synthetic-bofa-deposit.pdf`,
  await syntheticPdf('Bank of America', { deposit: true }),
);
console.log(
  `Four synthetic-only statement PDFs created in ${destination}. This directory is ignored by Git.`,
);

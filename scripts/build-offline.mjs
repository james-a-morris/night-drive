import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async entry => entry.isDirectory()
    ? (await files(join(directory, entry.name))).map(name => `${entry.name}/${name}`)
    : [entry.name]))).flat().sort();
}

export async function buildOffline(root = process.cwd()) {
  const html = await readFile(join(root, '.next/server/app/index.html'), 'utf8');
  const worker = await readFile(join(root, 'src/service-worker.js'), 'utf8');
  // Include lazy chunks and every scenery asset, even if this visit only used Calm.
  const staticFiles = (await files(join(root, '.next/static')))
    .filter(name => /\.(js|css|woff2?|ttf|otf|png|svg|webp)$/.test(name));
  const publicFiles = (await files(join(root, 'public/assets')))
    .filter(name => !name.endsWith('.txt'));
  const assets = [
    ...staticFiles.map(name => ({ url: `/_next/static/${name}`, file: `.next/static/${name}` })),
    ...publicFiles.map(name => ({ url: `/assets/${name}`, file: `public/assets/${name}` })),
  ];
  const hash = createHash('sha256').update(html).update(worker);
  let bytes = Buffer.byteLength(html);
  for (const asset of assets) {
    const content = await readFile(join(root, asset.file));
    hash.update(asset.url).update(content);
    bytes += content.length;
  }
  const version = hash.digest('hex').slice(0, 20);
  const shell = `/offline-shell-${version}.html`;
  const manifest = {
    version,
    shell,
    assets: [shell, ...assets.map(asset => asset.url), '/icon.svg', '/apple-icon', '/manifest.webmanifest', '/app-icon/192', '/app-icon/512'],
  };
  // A versioned shell cannot accidentally fetch a newer deployment's HTML with
  // an older deployment's chunks while an update is being installed.
  for (const name of await readdir(join(root, 'public'))) {
    if (/^offline-shell-[a-f0-9]+\.html$/.test(name)) await rm(join(root, 'public', name));
  }
  await writeFile(join(root, 'public', shell.slice(1)), html);
  await writeFile(join(root, 'public/sw.js'), `const OFFLINE = ${JSON.stringify(manifest)};\n${worker}`);
  console.log(`Offline copy: ${manifest.assets.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MiB (${version}).`);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await buildOffline();
}

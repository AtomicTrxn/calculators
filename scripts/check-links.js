#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const htmlFiles = fs.readdirSync(root).filter(file => file.endsWith('.html'));
const external = /^(?:[a-z]+:|#|mailto:|tel:)/i;
const missing = [];

for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const hrefs = [...html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);

  for (const href of hrefs) {
    if (external.test(href)) continue;

    const localPath = decodeURIComponent(href.split('#')[0].split('?')[0]);
    if (!localPath) continue;

    const target = path.resolve(root, path.dirname(file), localPath);
    if (!fs.existsSync(target)) {
      missing.push(`${file} -> ${href}`);
    }
  }
}

if (missing.length) {
  console.error('Missing local links:');
  missing.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`Checked ${htmlFiles.length} HTML file${htmlFiles.length === 1 ? '' : 's'}: local links ok`);

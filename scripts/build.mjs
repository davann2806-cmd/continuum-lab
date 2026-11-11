import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function stripModuleSyntax(code) {
  return code
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*export\s+(class|function|const|let)\s+/gm, '$1 ');
}

async function build() {
  const htmlRaw = await fs.readFile(path.join(ROOT, 'index.html'), 'utf8');
  const cssRaw = await fs.readFile(path.join(ROOT, 'styles/main.css'), 'utf8');

  const moduleOrder = [
    'src/i18n/translations.js',
    'src/engines/fluid.js',
    'src/engines/wave.js',
    'src/engines/nbody.js',
    'src/engines/audio.js',
    'src/main.js'
  ];

  const chunks = [];
  for (const rel of moduleOrder) {
    const src = await fs.readFile(path.join(ROOT, rel), 'utf8');
    chunks.push(`// --- ${rel} ---\n` + stripModuleSyntax(src));
  }

  const combinedJs = `(function () {\n'use strict';\n${chunks.join('\n\n')}\n})();`;

  // Syntax-check bundled JS via Node vm.Script before emitting
  new vm.Script(combinedJs, { filename: 'continuum.bundle.js' });

  // Build CSP-clean self-contained HTML (no external font links needed offline)
  const standaloneHtml = htmlRaw
    .replace(/<link[^>]*fonts\.googleapis\.com[^>]*>\s*/g, '')
    .replace(/<link[^>]*fonts\.gstatic\.com[^>]*>\s*/g, '')
    .replace(
      /<link\s+rel="stylesheet"\s+href="\.\/styles\/main\.css"\s*\/?>/,
      `<style>\n${cssRaw}\n</style>`
    )
    .replace(
      /<script\s+type="module"\s+src="\.\/src\/main\.js"><\/script>/,
      `<script>\n${combinedJs}\n</script>`
    );

  const distDir = path.join(ROOT, 'dist');
  await fs.mkdir(distDir, { recursive: true });
  await fs.writeFile(path.join(distDir, 'index.html'), standaloneHtml, 'utf8');
  console.log(`Built dist/index.html (${(standaloneHtml.length / 1024).toFixed(1)} KB) — VM syntax verified.`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Wraps the vendored Three.js r180 ES modules into one classic script that defines window.THREE.
// A classic script also runs when index.html is opened directly from disk (file://), where
// browsers refuse to load ES modules. Each original module keeps its own function scope.
//   node build/make_three_classic.mjs
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const vendor = join(here, 'vendor');
const out = join(here, '..', 'dist', 'assets', 'js', 'three.classic.js');

const core = readFileSync(join(vendor, 'three.core.js'), 'utf8').split('\n');
const mod = readFileSync(join(vendor, 'three.module.js'), 'utf8').split('\n');

const names = (line) => line.slice(line.indexOf('{') + 1, line.indexOf('}')).split(',').map((s) => s.trim()).filter(Boolean);

const coreExportIdx = core.findIndex((l) => l.startsWith('export {'));
if (coreExportIdx < 0 || core.slice(coreExportIdx + 1).some((l) => l.trim())) throw new Error('unexpected core layout');
const coreNames = names(core[coreExportIdx]);
const coreBody = core.slice(0, coreExportIdx).join('\n');

const importIdx = mod.findIndex((l) => l.startsWith('import {'));
const reexportIdx = mod.findIndex((l) => l.startsWith('export {') && l.includes("from './three.core.js'"));
const modExportIdx = mod.findLastIndex((l) => l.startsWith('export {'));
const imported = names(mod[importIdx]);
const reexported = names(mod[reexportIdx]);
const modNames = names(mod[modExportIdx]);
const modBody = mod.filter((_, i) => i !== importIdx && i !== reexportIdx && i !== modExportIdx).join('\n');

for (const n of [...imported, ...reexported, ...modNames, ...coreNames]) {
  if (!/^[A-Za-z_$][\w$]*$/.test(n)) throw new Error('aliased export not supported: ' + n);
}

const js = `/* three.js r180 (MIT, see LICENSE-three.txt) wrapped as a classic script by build/make_three_classic.mjs */
(function () {
var __core = (function () {
'use strict';
${coreBody}
return { ${coreNames.join(', ')} };
})();
var __mod = (function (__core) {
'use strict';
var { ${imported.join(', ')} } = __core;
${modBody}
return { ${modNames.join(', ')} };
})(__core);
var THREE = Object.assign({}, __core, __mod);
${reexported.map((n) => `if (!(${JSON.stringify(n)} in THREE)) throw new Error('missing ${n}');`).join('\n')}
window.THREE = Object.freeze(THREE);
})();
`;
writeFileSync(out, js);
copyFileSync(join(vendor, 'LICENSE.txt'), join(here, '..', 'dist', 'assets', 'js', 'LICENSE-three.txt'));
console.log('wrote', out, (js.length / 1024).toFixed(0) + ' KB', 'exports', Object.keys({}).length + coreNames.length + modNames.length);

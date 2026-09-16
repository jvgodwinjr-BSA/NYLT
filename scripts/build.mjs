// Static "build": copy the deployable files into dist/. Hostinger runs `npm run build` and publishes dist/.
import { rmSync, mkdirSync, cpSync, existsSync } from 'node:fs';
const out = 'dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const p of ['index.html', '.htaccess', 'src', 'packs', 'public', 'api']) if (existsSync(p)) cpSync(p, `${out}/${p}`, { recursive: true, filter: (s) => { const q = s.replace(/\\/g, '/'); return !/(^|\/)\.(?!htaccess|gitkeep)/.test(q) && !/\.local\./.test(q) && !/(^|\/)source\//.test(q) && !/\/data\/.*\.json$/.test(q); } });
console.log(`Built ${out}/`);

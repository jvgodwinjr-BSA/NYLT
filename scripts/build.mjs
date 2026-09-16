// Static "build": copy the deployable files into dist/. Hostinger runs `npm run build` and publishes dist/.
import { rmSync, mkdirSync, cpSync, existsSync, writeFileSync } from 'node:fs';
const out = 'dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const p of ['index.html', 'src', 'packs', 'public']) if (existsSync(p)) cpSync(p, `${out}/${p}`, { recursive: true, filter: (s) => !/(^|\/)(\.|.*\.local\.|source\/)/.test(s.replace(/\\/g, '/')) });
writeFileSync(`${out}/.htaccess`, 'Options -Indexes\nAddType application/json .enc\n<FilesMatch "\\.(json|enc|csv)$">\n  Header set Cache-Control "no-store"\n</FilesMatch>\n');
console.log(`Built ${out}/`);

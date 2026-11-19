import fs from 'node:fs';
import path from 'node:path';

// En local, les clés sont dans le fichier .env à la racine du dépôt (jamais envoyé sur GitHub).
// Sur Vercel, elles sont saisies dans les variables d'environnement du projet.
const rootEnv = path.join(process.cwd(), '..', '.env');
if (fs.existsSync(rootEnv)) {
  for (const line of fs.readFileSync(rootEnv, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

export default {};

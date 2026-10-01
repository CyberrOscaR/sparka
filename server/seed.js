// `npm run seed` → borra y regenera los perfiles demo.
import { config } from './config.js';
import { openDb } from './db.js';
import { hasDemoProfiles, removeDemoProfiles, seedDemoProfiles } from './demo.js';

const db = openDb(config.dbFile);
if (process.argv.includes('--reset')) removeDemoProfiles(db);
if (hasDemoProfiles(db)) {
  console.log('Ya hay perfiles demo. Usa --reset para regenerarlos.');
} else {
  console.log(`Creados ${seedDemoProfiles(db)} perfiles demo.`);
}
db.close();

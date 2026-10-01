import { createApp } from './app.js';
import { config } from './config.js';

const { server, close } = createApp();

server.listen(config.port, () => {
  console.log(`✨ Sparka escuchando en http://localhost:${config.port}`);
  if (config.demoMode) console.log('   Modo demo activo: hay perfiles de ejemplo marcados como "Demo".');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    close();
    process.exit(0);
  });
}

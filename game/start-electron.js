import { createServer } from 'vite';
import { spawn } from 'child_process';

async function start() {
  const server = await createServer({
    server: { port: 5173 }
  });
  await server.listen();
  server.printUrls();

  const electronProcess = spawn('npx', ['electron', '.'], {
    stdio: 'inherit',
    shell: true
  });

  electronProcess.on('close', () => {
    server.close();
    process.exit();
  });
}

start();

import index from '../src/index.html'
import { readReadyLine } from './ready-line'

const DEV_PORT = Number(process.env.DBCLI_GUI_DEV_PORT ?? 3000)

// Spawn the sidecar child process. It prints {ready,port,token} as its first stdout line.
const sidecar = Bun.spawn(['bun', 'run', 'sidecar/index.ts'], {
  stdout: 'pipe',
  stderr: 'inherit',
  env: { ...process.env },
})

const ready = await readReadyLine(sidecar.stdout)

const server = Bun.serve({
  port: DEV_PORT,
  development: { hmr: true, console: true },
  routes: { '/': index },
})

const url = `http://localhost:${server.port}/?port=${ready.port}&token=${ready.token}`
console.log(`\n  dbcli-gui dev server:\n  ${url}\n`)

const shutdown = () => {
  try {
    sidecar.kill()
  } finally {
    process.exit(0)
  }
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
// If the sidecar dies on its own, take the dev server down too.
sidecar.exited.then(() => {
  console.error('sidecar exited; shutting down dev server')
  shutdown()
})

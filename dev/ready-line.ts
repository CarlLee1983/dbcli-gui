export interface SidecarReady {
  ready: boolean
  port: number
  token: string
}

/** Read the first newline-terminated JSON line from a process stdout stream. */
export async function readReadyLine(stream: ReadableStream<Uint8Array>): Promise<SidecarReady> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) throw new Error('sidecar exited before ready line')
      buffer += decoder.decode(value, { stream: true })
      const nl = buffer.indexOf('\n')
      if (nl >= 0) return JSON.parse(buffer.slice(0, nl)) as SidecarReady
    }
  } finally {
    reader.releaseLock()
  }
}

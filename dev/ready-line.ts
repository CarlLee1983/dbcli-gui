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
      if (nl >= 0) {
        const raw = buffer.slice(0, nl)
        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(raw) as Record<string, unknown>
        } catch {
          throw new Error(`sidecar ready line is not valid JSON: ${raw}`)
        }
        if (typeof parsed.port !== 'number' || typeof parsed.token !== 'string') {
          throw new Error(`sidecar ready line missing port/token: ${raw}`)
        }
        return parsed as unknown as SidecarReady
      }
    }
  } finally {
    reader.releaseLock()
  }
}

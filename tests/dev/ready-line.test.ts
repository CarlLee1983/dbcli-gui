import { test, expect } from 'bun:test'
import { readReadyLine } from '../../dev/ready-line'

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
}

test('parses the first JSON line and ignores later output', async () => {
  const stream = streamOf(['{"ready":true,"port":12345,"token":"abc"}\n', 'later log line\n'])
  const ready = await readReadyLine(stream)
  expect(ready).toEqual({ ready: true, port: 12345, token: 'abc' })
})

test('handles a JSON line split across chunks', async () => {
  const stream = streamOf(['{"ready":true,', '"port":7,"token":"z"}\n'])
  const ready = await readReadyLine(stream)
  expect(ready.port).toBe(7)
  expect(ready.token).toBe('z')
})

test('throws if the stream ends before a newline', async () => {
  const stream = streamOf(['{"ready":true'])
  await expect(readReadyLine(stream)).rejects.toThrow(/before ready/)
})

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const W = 1024
const H = 1024
const [R, G, B] = [0x2b, 0x6c, 0xb0] // dbcli 藍

// raw scanlines: each row = 1 filter byte (0=None) + W*3 RGB bytes
const raw = Buffer.alloc(H * (1 + W * 3))
for (let y = 0; y < H; y++) {
  const off = y * (1 + W * 3)
  raw[off] = 0
  for (let x = 0; x < W; x++) {
    const p = off + 1 + x * 3
    raw[p] = R
    raw[p + 1] = G
    raw[p + 2] = B
  }
}

const crcTable: number[] = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 2 // colour type: truecolour RGB
const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])
writeFileSync('app-icon.png', png)
console.log('wrote app-icon.png')

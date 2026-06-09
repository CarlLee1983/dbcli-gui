import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const W = 1024
const H = 1024

// RGBA Buffer for drawing
const canvas = Buffer.alloc(W * H * 4)

function setPixel(x: number, y: number, r: number, g: number, b: number, a: number) {
  if (x < 0 || x >= W || y < 0 || y >= H) return
  const off = (y * W + x) * 4
  canvas[off] = r
  canvas[off + 1] = g
  canvas[off + 2] = b
  canvas[off + 3] = a
}

function drawRoundedRect(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  renderColor: (x: number, y: number) => [number, number, number, number]
) {
  for (let py = y; py < y + height; py++) {
    for (let px = x; px < x + width; px++) {
      let draw = false
      if (px < x + radius && py < y + radius) {
        // Top left
        const dx = px - (x + radius)
        const dy = py - (y + radius)
        if (dx * dx + dy * dy <= radius * radius) draw = true
      } else if (px >= x + width - radius && py < y + radius) {
        // Top right
        const dx = px - (x + width - radius)
        const dy = py - (y + radius)
        if (dx * dx + dy * dy <= radius * radius) draw = true
      } else if (px < x + radius && py >= y + height - radius) {
        // Bottom left
        const dx = px - (x + radius)
        const dy = py - (y + height - radius)
        if (dx * dx + dy * dy <= radius * radius) draw = true
      } else if (px >= x + width - radius && py >= y + height - radius) {
        // Bottom right
        const dx = px - (x + width - radius)
        const dy = py - (y + height - radius)
        if (dx * dx + dy * dy <= radius * radius) draw = true
      } else {
        draw = true
      }

      if (draw) {
        const [r, g, b, a] = renderColor(px, py)
        setPixel(px, py, r, g, b, a)
      }
    }
  }
}

// Modern & Bold palette (Blue-600 base: #2563eb)
const COLOR_LIGHT = [59, 130, 246, 255] // Blue-500
const COLOR_MID = [37, 99, 235, 255]   // Blue-600
const COLOR_DARK = [30, 64, 175, 255]  // Blue-800

function cylinderColor(px: number, py: number, x: number, width: number): [number, number, number, number] {
  const centerX = x + width / 2
  const dist = Math.abs(px - centerX) / (width / 2)
  
  // Simple horizontal gradient for 3D look
  // 0.0 (center) -> Light
  // 1.0 (edges) -> Dark
  const r = Math.round(COLOR_LIGHT[0]! * (1 - dist) + COLOR_DARK[0]! * dist)
  const g = Math.round(COLOR_LIGHT[1]! * (1 - dist) + COLOR_DARK[1]! * dist)
  const b = Math.round(COLOR_LIGHT[2]! * (1 - dist) + COLOR_DARK[2]! * dist)
  return [r, g, b, 255]
}

function draw() {
  const width = 600
  const height = 180
  const radius = 60
  const x = (W - width) / 2
  const gap = 40
  
  // Draw 3 stacked cylinders
  // Bottom
  drawRoundedRect(x, 650, width, height, radius, (px, py) => cylinderColor(px, py, x, width))
  // Middle
  drawRoundedRect(x, 430, width, height, radius, (px, py) => cylinderColor(px, py, x, width))
  // Top
  drawRoundedRect(x, 210, width, height, radius, (px, py) => cylinderColor(px, py, x, width))
}

// Generate image
draw()

// raw scanlines: each row = 1 filter byte (0=None) + W*4 RGBA bytes
const raw = Buffer.alloc(H * (1 + W * 4))
for (let y = 0; y < H; y++) {
  const off = y * (1 + W * 4)
  raw[off] = 0 // Filter None
  canvas.copy(raw, off + 1, y * W * 4, (y + 1) * W * 4)
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
ihdr[9] = 6 // colour type: 6 = RGBA

const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])

writeFileSync('app-icon.png', png)
console.log('wrote app-icon.png with stylized database icon')

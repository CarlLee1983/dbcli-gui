import { test, expect } from 'bun:test'
import { generateToken, checkBearer } from '../../sidecar/auth'

function reqWith(auth?: string): Request {
  return new Request('http://localhost/x', auth ? { headers: { authorization: auth } } : {})
}

test('generateToken returns a long random hex string', () => {
  const a = generateToken()
  const b = generateToken()
  expect(a).not.toBe(b)
  expect(a.length).toBeGreaterThanOrEqual(32)
})

test('checkBearer accepts the exact token and rejects others', () => {
  expect(checkBearer(reqWith('Bearer secret'), 'secret')).toBe(true)
  expect(checkBearer(reqWith('Bearer wrong'), 'secret')).toBe(false)
  expect(checkBearer(reqWith(), 'secret')).toBe(false)
  expect(checkBearer(reqWith('secret'), 'secret')).toBe(false) // missing "Bearer " prefix
})

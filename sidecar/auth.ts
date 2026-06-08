import { randomBytes } from 'node:crypto'

export function generateToken(): string {
  return randomBytes(24).toString('hex')
}

/** Constant-prefix bearer check. Returns true iff header is exactly `Bearer <token>`. */
export function checkBearer(req: Request, token: string): boolean {
  const header = req.headers.get('authorization')
  return header === `Bearer ${token}`
}

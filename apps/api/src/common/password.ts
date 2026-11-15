import { hash, verify } from '@node-rs/argon2'

// Wraps the argon2 library so swapping it is one file's problem. Hashing runs on the libuv
// thread pool (async napi task), so it never blocks the event loop.
// Parameters follow the OWASP argon2id baseline (19 MiB memory, t=2, p=1).
const ARGON2ID = 2 // `Algorithm.Argon2id` is an ambient const enum, unusable under verbatimModuleSyntax
const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

export const hashPassword = (plain: string): Promise<string> => hash(plain, OPTIONS)

export const verifyPassword = async (hashed: string, plain: string): Promise<boolean> => {
  try {
    return await verify(hashed, plain)
  } catch {
    return false
  }
}

// Verified against when the user does not exist, so login timing doesn't reveal which emails
// are registered.
let dummyHash: Promise<string> | undefined
export const dummyPasswordHash = (): Promise<string> => {
  dummyHash ??= hashPassword('timing-equalizer-not-a-real-password')
  return dummyHash
}

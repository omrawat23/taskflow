import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests run against a real MongoDB replica set (real mongod binary), never a mock.
    globalSetup: ['./src/test/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})

import { MongoMemoryReplSet } from 'mongodb-memory-server'
import type { TestProject } from 'vitest/node'

// One real MongoDB replica set for the whole run (transactions need a replica set).
// Each test file gets its own database on it, so files stay isolated and parallel.
declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string
  }
}

export default async function setup(project: TestProject) {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  })
  project.provide('mongoUri', replSet.getUri())
  return async () => {
    await replSet.stop()
  }
}

// Local MongoDB replica set without Docker (transactions require a replica set).
// Uses a real mongod binary downloaded by mongodb-memory-server; data persists in ./.devdb.
import { mkdirSync } from 'node:fs'
import { MongoMemoryReplSet } from 'mongodb-memory-server'

const dbPath = new URL('../.devdb', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
mkdirSync(dbPath, { recursive: true })

const replSet = await MongoMemoryReplSet.create({
  replSet: { name: 'rs0', count: 1, storageEngine: 'wiredTiger' },
  instanceOpts: [{ port: 27017, dbPath }],
})

process.stdout.write(`MongoDB replica set ready: ${replSet.getUri('taskflow')}\n`)

const stop = async () => {
  await replSet.stop({ doCleanup: false })
  process.exit(0)
}
process.on('SIGINT', () => void stop())
process.on('SIGTERM', () => void stop())

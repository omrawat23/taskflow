import type { TaskStatus } from '@taskflow/contracts'
import { type ClientSession, type Db, type Filter, ObjectId } from 'mongodb'
import { Task, type TaskDoc, type TaskPage } from './tasks.schema.js'

// Ownership is enforced in every query: another user's task is indistinguishable from a missing one.

const toTask = (doc: TaskDoc): Task =>
  Task.parse({
    id: doc._id.toHexString(),
    ownerId: doc.ownerId.toHexString(),
    title: doc.title,
    description: doc.description,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  })

const owned = (ownerId: string, id: string): Filter<TaskDoc> => ({
  _id: new ObjectId(id),
  ownerId: new ObjectId(ownerId),
})

export const tasksRepo = (db: Db) => {
  const col = db.collection<TaskDoc>('tasks')
  return {
    /** Cursor pagination on `_id` (time-ordered): stable under inserts, served by an index. */
    list: async (
      ownerId: string,
      {
        cursor,
        limit,
        status,
      }: { cursor?: string | undefined; limit: number; status?: TaskStatus | undefined },
    ): Promise<TaskPage> => {
      const filter: Filter<TaskDoc> = { ownerId: new ObjectId(ownerId) }
      if (status) filter.status = status
      if (cursor) filter._id = { $lt: new ObjectId(cursor) }
      const docs = await col
        .find(filter)
        .sort({ _id: -1 })
        .limit(limit + 1)
        .toArray()
      const page = docs.slice(0, limit)
      const last = page.at(-1)
      return {
        items: page.map(toTask),
        nextCursor: docs.length > limit && last ? last._id.toHexString() : null,
      }
    },

    findById: async (ownerId: string, id: string): Promise<Task | null> => {
      const doc = await col.findOne(owned(ownerId, id))
      return doc ? toTask(doc) : null
    },

    create: async (
      cmd: { ownerId: string; title: string; description: string },
      session: ClientSession,
    ): Promise<Task> => {
      const now = new Date()
      const doc: TaskDoc = {
        _id: new ObjectId(),
        ownerId: new ObjectId(cmd.ownerId),
        title: cmd.title,
        description: cmd.description,
        status: 'todo',
        createdAt: now,
        updatedAt: now,
      }
      await col.insertOne(doc, { session })
      return toTask(doc)
    },

    update: async (
      ownerId: string,
      id: string,
      patch: Partial<Pick<TaskDoc, 'title' | 'description' | 'status'>>,
      session: ClientSession,
    ): Promise<Task | null> => {
      const doc = await col.findOneAndUpdate(
        owned(ownerId, id),
        { $set: { ...patch, updatedAt: new Date() } },
        { returnDocument: 'after', session },
      )
      return doc ? toTask(doc) : null
    },

    delete: async (ownerId: string, id: string, session: ClientSession): Promise<boolean> => {
      const result = await col.deleteOne(owned(ownerId, id), { session })
      return result.deletedCount === 1
    },
  }
}

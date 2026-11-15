import { describe, expect, test } from 'vitest'
import type { Task } from '@/common/lib/schemas'
import { patchTaskInPages, removeTaskFromPages, type TaskPages } from './task-cache'

// Unit tests for pure logic only: the cache transforms behind optimistic updates.
const task = (id: string, title: string): Task => ({
  id,
  ownerId: 'o',
  title,
  description: '',
  status: 'todo',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

const pages: TaskPages = {
  pageParams: [undefined, 'b'],
  pages: [
    { items: [task('a', 'A'), task('b', 'B')], nextCursor: 'b' },
    { items: [task('c', 'C')], nextCursor: null },
  ],
}

describe('task cache transforms', () => {
  test('patches the matching task on whichever page it lives', () => {
    const next = patchTaskInPages(pages, 'c', { status: 'done' })
    expect(next?.pages[1]?.items[0]?.status).toBe('done')
    expect(next?.pages[0]?.items.every((t) => t.status === 'todo')).toBe(true)
  })

  test('removes the task without touching cursors', () => {
    const next = removeTaskFromPages(pages, 'b')
    expect(next?.pages.flatMap((p) => p.items.map((t) => t.id))).toEqual(['a', 'c'])
    expect(next?.pages[0]?.nextCursor).toBe('b')
  })

  test('never mutates the cached input', () => {
    patchTaskInPages(pages, 'a', { title: 'changed' })
    expect(pages.pages[0]?.items[0]?.title).toBe('A')
  })

  test('passes an empty cache through untouched', () => {
    expect(patchTaskInPages(undefined, 'a', { status: 'done' })).toBeUndefined()
  })
})

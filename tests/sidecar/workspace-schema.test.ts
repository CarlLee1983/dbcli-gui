import { test, expect } from 'bun:test'
import { WorkspaceAddBody, WorkspaceIdBody } from '../../shared/schemas'

test('WorkspaceAddBody:path 必填、label 可選', () => {
  expect(WorkspaceAddBody.safeParse({ path: '/a' }).success).toBe(true)
  expect(WorkspaceAddBody.safeParse({ path: '/a', label: 'x' }).success).toBe(true)
  expect(WorkspaceAddBody.safeParse({}).success).toBe(false)
})

test('WorkspaceIdBody:id 必填', () => {
  expect(WorkspaceIdBody.safeParse({ id: 'p1' }).success).toBe(true)
  expect(WorkspaceIdBody.safeParse({ id: '' }).success).toBe(false)
})

import type { TreeTable } from '../api/types'

/** Case-insensitive substring filter on table/view name. Empty query → all. */
export function filterTree(tree: TreeTable[], query: string): TreeTable[] {
  const q = query.trim().toLowerCase()
  if (q === '') return tree
  return tree.filter((t) => t.name.toLowerCase().includes(q))
}

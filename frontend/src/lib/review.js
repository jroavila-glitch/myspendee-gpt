export function groupReviewReasons(items) {
  const counts = new Map()
  for (const item of items) {
    for (const reason of item.reasons) {
      counts.set(reason, (counts.get(reason) || 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

export function reviewAffectedValue(items) {
  return items.reduce((total, item) => total + Number(item.amount_mxn || 0), 0)
}

export function getNextReviewItemId(items, activeId, removedId) {
  const activeIndex = items.findIndex((item) => item.id === activeId)
  const remaining = items.filter((item) => item.id !== removedId)
  if (!remaining.length) return null
  if (activeIndex < 0) return remaining[0].id
  return remaining[Math.min(activeIndex, remaining.length - 1)].id
}

export function isReviewShortcutTarget(target) {
  if (!target) return true
  return !target.isContentEditable && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

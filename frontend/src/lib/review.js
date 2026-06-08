export function groupReviewReasons(items) {
  const counts = new Map()
  for (const item of items) {
    for (const reason of item.review_reasons) {
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

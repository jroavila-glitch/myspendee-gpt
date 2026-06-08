import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getNextReviewItemId,
  groupReviewReasons,
  isReviewShortcutTarget,
  reviewAffectedValue,
} from '../src/lib/review.js'

test('groups review reasons and totals affected MXN value', () => {
  const items = [
    { reasons: ['Unclassified'], amount_mxn: 100 },
    { reasons: ['Unclassified', 'Higher than usual'], amount_mxn: 50 },
  ]
  assert.deepEqual(groupReviewReasons(items), [
    { label: 'Unclassified', count: 2 },
    { label: 'Higher than usual', count: 1 },
  ])
  assert.equal(reviewAffectedValue(items), 150)
})

test('sorts equally frequent review reasons by label', () => {
  const items = [
    { reasons: ['Unclassified', 'Higher than usual'], amount_mxn: 100 },
  ]

  assert.deepEqual(groupReviewReasons(items), [
    { label: 'Higher than usual', count: 1 },
    { label: 'Unclassified', count: 1 },
  ])
})

test('selects the next unresolved item after the active item leaves', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  assert.equal(getNextReviewItemId(items, 'b', 'b'), 'c')
  assert.equal(getNextReviewItemId(items, 'c', 'c'), 'b')
  assert.equal(getNextReviewItemId(items, 'missing', 'missing'), 'a')
})

test('review shortcuts ignore editable controls', () => {
  assert.equal(isReviewShortcutTarget({ tagName: 'INPUT', isContentEditable: false }), false)
  assert.equal(isReviewShortcutTarget({ tagName: 'DIV', isContentEditable: true }), false)
  assert.equal(isReviewShortcutTarget({ tagName: 'BUTTON', isContentEditable: false }), true)
})

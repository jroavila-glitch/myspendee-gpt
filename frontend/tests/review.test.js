import test from 'node:test'
import assert from 'node:assert/strict'
import { groupReviewReasons, reviewAffectedValue } from '../src/lib/review.js'

test('groups review reasons and totals affected MXN value', () => {
  const items = [
    { review_reasons: ['Unclassified'], amount_mxn: 100 },
    { review_reasons: ['Unclassified', 'Higher than usual'], amount_mxn: 50 },
  ]
  assert.deepEqual(groupReviewReasons(items), [
    { label: 'Unclassified', count: 2 },
    { label: 'Higher than usual', count: 1 },
  ])
  assert.equal(reviewAffectedValue(items), 150)
})

test('sorts equally frequent review reasons by label', () => {
  const items = [
    { review_reasons: ['Unclassified', 'Higher than usual'], amount_mxn: 100 },
  ]

  assert.deepEqual(groupReviewReasons(items), [
    { label: 'Higher than usual', count: 1 },
    { label: 'Unclassified', count: 1 },
  ])
})

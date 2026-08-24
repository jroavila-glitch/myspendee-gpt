import assert from 'node:assert/strict'
import { test } from 'node:test'

import { api } from '../src/lib/api.js'

test('retries transient GET fetch failures', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    if (calls < 2) throw new TypeError('Failed to fetch')
    return new Response(JSON.stringify(['ARQ', 'Revolut']), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    assert.deepEqual(await api.banks(), ['ARQ', 'Revolut'])
    assert.equal(calls, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

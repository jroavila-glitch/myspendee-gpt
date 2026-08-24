const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:8000'
const RETRY_DELAYS_MS = [300, 900]

function formatErrorMessage(rawMessage) {
  try {
    const parsed = JSON.parse(rawMessage)
    if (parsed?.detail) {
      if (typeof parsed.detail === 'string') return parsed.detail
      if (Array.isArray(parsed.detail)) {
        return parsed.detail.map((item) => item.msg || item.message || JSON.stringify(item)).join(', ')
      }
    }
  } catch {
    return rawMessage || 'Request failed'
  }
  return rawMessage || 'Request failed'
}

function isReadRequest(options) {
  return (options.method || 'GET').toUpperCase() === 'GET'
}

function isRetryableStatus(status) {
  return [408, 429, 500, 502, 503, 504].includes(status)
}

function sleep(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms))
}

async function request(path, options = {}) {
  const { retry, ...fetchOptions } = options
  const maxRetries = retry ?? (isReadRequest(fetchOptions) ? RETRY_DELAYS_MS.length : 0)

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(`${API_URL}${path}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(fetchOptions.headers || {}),
        },
        ...fetchOptions,
      })

      if (!response.ok) {
        const message = await response.text()
        const error = new Error(formatErrorMessage(message))
        error.status = response.status
        if (attempt < maxRetries && isRetryableStatus(response.status)) {
          await sleep(RETRY_DELAYS_MS[attempt])
          continue
        }
        throw error
      }

      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        return response.json()
      }
      return null
    } catch (error) {
      if (error.status && !isRetryableStatus(error.status)) {
        throw error
      }
      if (attempt < maxRetries) {
        await sleep(RETRY_DELAYS_MS[attempt])
        continue
      }
      throw error
    }
  }

  return null
}

export const api = {
  listTransactions: (params) => request(`/transactions?${new URLSearchParams(params).toString()}`),
  pendingMatches: (params) => request(`/pending-matches?${new URLSearchParams(params).toString()}`),
  summary: (params) => request(`/summary?${new URLSearchParams(params).toString()}`),
  breakdown: (params) => request(`/breakdown?${new URLSearchParams(params).toString()}`),
  insights: (params) => request(`/insights?${new URLSearchParams(params).toString()}`),
  fxRates: (params = {}) => request(`/fx-rates?${new URLSearchParams(params).toString()}`),
  banks: () => request('/banks'),
  categories: () => request('/categories'),
  statements: () => request('/statements'),
  addTransaction: (body) => request('/transactions', { method: 'POST', body: JSON.stringify(body) }),
  updateTransaction: (id, body) => request(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  createClassificationRule: (id, body) => request(`/transactions/${id}/classification-rules`, { method: 'POST', body: JSON.stringify(body) }),
  reconcilePending: (pendingId, postedId) => request(`/transactions/${pendingId}/reconcile/${postedId}`, { method: 'POST' }),
  deleteTransaction: (id) => request(`/transactions/${id}`, { method: 'DELETE' }),
  setAllocations: (id, transaction, allocations) => request(`/transactions/${id}/allocations`, {
    method: 'PUT',
    body: JSON.stringify({
      expected_amount_mxn: transaction.amount_mxn,
      expected_amount_original: transaction.amount_original,
      expected_currency_original: transaction.currency_original,
      expected_type: transaction.type,
      allocations,
    }),
  }),
  clearAllocations: (id, category) => request(`/transactions/${id}/allocations?${new URLSearchParams({ category }).toString()}`, { method: 'DELETE' }),
  bulkUpdate: (body) => request('/transactions/bulk-update', { method: 'POST', body: JSON.stringify(body) }),
  bulkDelete: (body) => request('/transactions/bulk-delete', { method: 'POST', body: JSON.stringify(body) }),
  deleteStatement: (id) => request(`/statements/${id}`, { method: 'DELETE' }),
  async uploadStatements(files) {
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    const response = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData })
    if (!response.ok) {
      throw new Error(formatErrorMessage(await response.text()))
    }
    return response.json()
  },
}

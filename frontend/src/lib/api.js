const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Request failed')
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json()
  }
  return null
}

export const api = {
  listTransactions: (params) => request(`/transactions?${new URLSearchParams(params).toString()}`),
  summary: (params) => request(`/summary?${new URLSearchParams(params).toString()}`),
  breakdown: (params) => request(`/breakdown?${new URLSearchParams(params).toString()}`),
  banks: () => request('/banks'),
  categories: () => request('/categories'),
  statements: () => request('/statements'),
  addTransaction: (body) => request('/transactions', { method: 'POST', body: JSON.stringify(body) }),
  updateTransaction: (id, body) => request(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteTransaction: (id) => request(`/transactions/${id}`, { method: 'DELETE' }),
  bulkUpdate: (body) => request('/transactions/bulk-update', { method: 'POST', body: JSON.stringify(body) }),
  deleteStatement: (id) => request(`/statements/${id}`, { method: 'DELETE' }),
  async uploadStatements(files) {
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    const response = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData })
    if (!response.ok) {
      throw new Error(await response.text())
    }
    return response.json()
  },
}


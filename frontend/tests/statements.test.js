import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getCoverageBankName } from '../src/lib/statementCoverage.js'
import {
  getStatementWarnings,
  getStatementWarningSummary,
  getWarningStatementCount,
} from '../src/lib/statements.js'

test('normalizes missing statement audit warnings to an empty list', () => {
  assert.deepEqual(getStatementWarnings({ filename: 'statement.pdf' }), [])
})

test('counts statements with import warnings', () => {
  const statements = [
    { audit_warnings: [] },
    { audit_warnings: ['Skipped 1 date-like block'] },
    { audit_warnings: ['Almitas count mismatch', 'Skipped 2 blocks'] },
  ]

  assert.equal(getWarningStatementCount(statements), 2)
  assert.equal(getStatementWarningSummary(statements), '2 statements with import warnings')
})

test('summarizes clean statements without warning noise', () => {
  assert.equal(getStatementWarningSummary([{ audit_warnings: [] }]), 'No import warnings')
})

test('maps NuBank statement metadata into Nu debit and credit coverage rows', () => {
  assert.equal(getCoverageBankName({
    filename: 'Nu Debit Julio 2026.pdf',
    bank_name: 'NuBank',
  }), 'Nu Debit')

  assert.equal(getCoverageBankName({
    filename: 'Nu Credit julio 2026.pdf',
    bank_name: 'NuBank',
  }), 'Nu Credit')
})

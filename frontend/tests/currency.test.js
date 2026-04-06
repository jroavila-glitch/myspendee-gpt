import test from 'node:test'
import assert from 'node:assert/strict'

import { getDisplayAmount, getSecondaryAmountLabel } from '../src/lib/currency.js'

test('keeps MXN values as-is for MXN display', () => {
  const transaction = {
    amount_mxn: '27493.39',
    amount_original: '1333.00',
    currency_original: 'EUR',
    exchange_rate_used: '20.625200',
    original_amount_display: 'EUR 1333.00',
  }

  assert.equal(getDisplayAmount(transaction, 'MXN', { MXN: 1, EUR: 20.544, USD: 17.9 }), 27493.39)
  assert.equal(getSecondaryAmountLabel(transaction, 'MXN'), 'EUR 1333.00')
})

test('uses original amount when display currency matches original currency', () => {
  const transaction = {
    amount_mxn: '27493.39',
    amount_original: '1333.00',
    currency_original: 'EUR',
    exchange_rate_used: '20.625200',
    original_amount_display: 'EUR 1333.00',
  }

  assert.equal(getDisplayAmount(transaction, 'EUR', { MXN: 1, EUR: 20.544, USD: 17.9 }), 1333)
  assert.equal(getSecondaryAmountLabel(transaction, 'EUR'), 'MXN 27493.39')
})

test('falls back from MXN using current display rate when original currency differs', () => {
  const transaction = {
    amount_mxn: '12575.04',
    amount_original: '600.00',
    currency_original: 'EUR',
    exchange_rate_used: '20.958400',
    original_amount_display: 'EUR 600.00',
  }

  assert.equal(Number(getDisplayAmount(transaction, 'USD', { MXN: 1, EUR: 20.544, USD: 17.9 }).toFixed(2)), 702.52)
  assert.equal(getSecondaryAmountLabel(transaction, 'USD'), 'EUR 600.00')
})

test('derives original amount from exchange rate when original amount is missing', () => {
  const transaction = {
    amount_mxn: '61.88',
    amount_original: null,
    currency_original: 'EUR',
    exchange_rate_used: '20.625200',
    original_amount_display: null,
  }

  assert.equal(Number(getDisplayAmount(transaction, 'EUR', { MXN: 1, EUR: 20.544, USD: 17.9 }).toFixed(2)), 3)
  assert.equal(getSecondaryAmountLabel(transaction, 'EUR'), 'MXN 61.88')
})


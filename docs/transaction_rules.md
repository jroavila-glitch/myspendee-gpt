# Transaction Rules

This document is the canonical source of truth for transaction parsing, normalization, classification, and dashboard behavior in `Moneo`.

When a new rule is added or changed, we should update:

1. This document
2. The matching backend rule/config/code
3. Regression tests covering the rule

## Status Legend

- `Implemented`: intended to be active in the app today
- `Pending`: approved rule that still needs product or backend work

## Global Behavior

- `Implemented`: Transactions are stored canonically in `MXN`.
- `Implemented`: The UI allows switching display currency between `MXN`, `EUR`, and `USD` for dashboard totals and transaction views.
- `Implemented`: Non-MXN transactions keep their original currency amount for display.
- `Implemented`: Ignored transactions are stored but excluded from dashboard metrics.
- `Implemented`: Duplicate detection blocks transactions already stored from
  prior uploads using `bank_name + date + amount_mxn + description`, while
  preserving identical rows that are visibly repeated within one statement.
- `Implemented`: Time filtering supports a specific month, `YTD`, and custom date ranges.
- `Implemented`: Month and YTD dashboard filters use each transaction's assigned
  month/year for reporting. The original bank transaction date is preserved for
  audit/history. Custom date ranges use the bank transaction date.
- `Implemented`: Summary and breakdown queries must respect active filters.

## Bank Name Normalization

- `Implemented`: `Nu`, `NU`, `Nu México Financier`, and similar variants normalize to `Nu`.
- `Implemented`: `HSBC 2Now` normalizes to `HSBC`.
- `Implemented`: `Millenium` and `Millennium` normalize to `Millennium`.
- `Implemented`: `Revolut` normalizes to `Revolut`.
- `Implemented`: DolarApp and ARQ statement variants normalize to `ARQ`.
- `Implemented`: Banamex product names stay distinct by product, such as `Oro Banamex` and `Costco Banamex`.
- `Implemented`: Rappi statements normalize to `Rappi`.

## FX and Amount Resolution

- `Implemented`: Banamex and HSBC foreign-card rows use statement FX fields like `TC1` and `TC2` when present.
- `Implemented`: HSBC 2Now rows use `Fecha de la operación` as the transaction date, not `Fecha de cargo`.
- `Implemented`: DolarApp/ARQ rows must not silently copy foreign-currency amounts into `amount_mxn`.
- `Implemented`: `EURc` is treated as `EUR`; `USDc` is treated as `USD`.
- `Implemented`: Fallback rates exist for unsupported or missing FX details.
- `Implemented`: When ARQ has no MXN-equivalent amount, we derive MXN from a true date-based FX source, preferably Banxico, with fallback rates only if lookup fails.

## Ignore Rules

Ignore any transaction matching normalized text patterns like:

- `MACSTORE MERIDA`
- `PAGO INTERBANCARIO`
- `PAY PAL*ADOBE`
- `AMAZON` with exactly `149 MXN`
- `SU PAGO GRACIAS`
- `SEBASTIAN WOHLER`
- `PAUL PITTERLEIN`
- `JOSE RODRIGO AVILA NEIRA`
- `PAGO A TU TARJETA DE CREDITO`
- `SENT FROM DOLARAPP`
- `DOLARAPP MEXICO ... SENT FROM ARQ`
- `PATRICIA NEIRA`
- `ARTURO PASTRANA`
- `INTERNATIONAL TRANSFER TO JOSE RODRIGO AVILA NEIRA`
- `PAGO POR SPEI`
- `CONVERSION USDC A EURC`
- `TRF P/ BRIDGE BUILDING`
- `BRIDGE BUILDING`
- `DIFERIMIENTO DE SALDO APP MOBILE`
- `EXCHANGED TO EUR`

Additional ignore behavior:

- `Implemented`: HSBC `SPEI A CTA` is ignored as an own-account transfer.
- `Implemented`: Credit-card payment rows are ignored.
- `Implemented`: ARQ roommate transfers from Sebastian Wohler and Paul Pitterlein are ignored from P&L but still useful for roommate/rent tracking.
- `Implemented`: `Dolarapp Mexico, S.A. de C.V. Sent from ARQ` is ignored as an own-account transfer.

## Income Rules

- `Implemented`: `CONTINI SOLUTIONS` -> `Perenniam Agency`
- `Implemented`: `FILIP MAREK` -> `Tennis Lessons`
- `Implemented`: DolarApp `Compra USDc` from `CONTINI SOLUTIONS` -> `Perenniam Agency`
- `Implemented`: DolarApp `Compra EURc` from `FILIP MAREK OLECHOWSKI` -> `Tennis Lessons`
- `Implemented`: `BONIFICACIÓN CON CASHBACK` -> `Credit Cards Cashback`
- `Implemented`: Rappi cashback rows are renamed to `RappiCard - BONIFICACIÓN CON CASHBACK`
- `Implemented`: `C COMBINATOR MEXICO` / `HONOS` -> `Azulik`
- `Implemented`: For Millennium and Revolut:
  - `Transfer from ROMAN JERZY SOBKOWIAK` -> `Ro IG Tennis`
  - income exactly `25 EUR` -> `Tennis Rush`
  - other income `<= 30 EUR` -> `Tennis Smash & Social`
  - income `> 30 EUR` -> `Tennis Lessons`
- `Implemented`: `TRF MB WAY DE KIRAH HITCHCOCK` -> `Tennis Smash & Social`
- `Implemented`: `TRF. P/ CAROLINA FREDERICA J GIMENEZ ALBARRAN` -> `Tennis Smash & Social`

## Expense Rules

- `Implemented`: Restaurant and cafe merchants like `FERTONANI CAFE`, `RC SANCHES`, `PANDORCA`, `ENJOY VALUE`, `FEITO PORTUGAL`, `ASUR C CONV SHOP`, `ZHANG YUEMEI`, and similar variants -> `Food & Drink`
- `Implemented`: `BOLT`, `UBR`, `UBER` without EATS, `LIME` -> `Transport`
- `Implemented`: `CONTINENTE`, `PINGO DOCE`, `CELEIRO`, `GLEBA`, `PAGOS FIJOS`, `EL CORTE INGLES`, `LIDL` -> `Groceries`
- `Implemented`: `TENNIS SHOP`, `DECATHLON`, `CLUBE INTERNACIONAL`, `TENNIS POINT`, `TP* TENNIS-POINT` -> `Tennis`
- `Implemented`: `COMPRA CAMARA LISBOA`, `CAMARA LISBOA CLUBE LISBOA`, `COMPRA CÂMARA LISBOA`, and close variants for Monsanto court bookings -> `Monsanto courts`
- `Implemented`: `AMAZON` or `AMZN` except the ignored `149 MXN` case -> `Home`
- `Implemented`: `ALMITAS INC INVEST` -> `Rent`
- `Implemented`: `GONCALO DE CAMPOS MELO` transfers on Revolut -> `Rent`
- `Implemented`: Only the monthly rent charge with original amount exactly
  `600 EUR` gets an assigned reporting month suggestion: day `28+` maps to
  the next month; day `1-3` stays in the current transaction month. Smaller
  housing-related transfers, utilities, or shared-cost payments stay in their
  transaction month even when they are categorized as `Rent`.
- `Implemented`: ARQ/DolarApp transfers to `JOSE ROBERTO AVILA` or
  `JOSE ROBERTO AVILA MAYOR` -> `Loan Papá`. These count as normal expenses.
- `Implemented`: `APARECIDA FERNANDA` -> `Home`
- `Implemented`: `RITUALS`, `GBMD ... MEDICINA`, `TRF MB WAY P/ FERNANDO ALVES`, `Transfer to FERNANDO CARLOS TEIXEIRA ALVES`, `Transfer to FERNANDO MOTA` and close variants -> `Healthcare`
- `Implemented`: `VODAFONE`, `TELCEL`, `REPAIR`, `M.REPAIR`, `ISHOP MIXUP`, `MACSTORE ...`, matching Apple service rows -> `Phone/Tech`
- `Implemented`: `PAYU *GOOGLE CLOUD`, `ELEVENLABS`, `GOOGLE WORKSPACE`, `CLAUDE.AI`, `ANTHROPIC`, `OBSIDIAN`, and close variants -> `IG Ro Project`
- `Implemented`: `HIGHLEVEL AGENCY SUB`, `CALENDLY`, `PADDLE.NET* ELFSIGHT`, `ELFSIGHT` -> `Perenniam Agency`
- `Implemented`: `NETFLIX`, `CINEMA`, `UCI CINEMAS`, `HBOMAX.COM`, `SPOTIFY`, `MUSICSPOTIFY`, and variants -> `Entertainment`
- `Implemented`: `AEROMEXICO`, `AERO MEXICO`, `AEROVIAS DE MEXICO`, and close variants -> `Travel`
- `Implemented`: `CLUBE VII LISBOA PT`, `UNITENIS LISBOA PT`, `CLUBE VII`, `Club7`, and similar variants -> `Gym` only when the original amount is exactly `110 EUR` or `120 EUR`; all other amounts -> `Food & Drink`
- `Implemented`: `IVA POR INTERESES`, `IVA INTERES`, `INTERES EXENTO`, `INTERES GRAVABLE`, `INTERESES`, `INTERES`, `IMPOSTO SELO`, `COMISION`, `CONTA PACOTE PROGRAMA PRESTIGE` -> `Bills/Fees`
- `Implemented`: `Compra EURc comisión` on ARQ is an expense in `Bills/Fees`
- `Implemented`: `Compra USDc comisión` on ARQ is an expense in `Bills/Fees`
- `Implemented`: `ALGARVEKNOWHOW` -> `Visa Portugal`
- `Implemented`: Unmatched expenses fall back to `Other` with note `Unclassified expense — manual review needed`
- `Implemented`: Imported or GPT-proposed categories must be one of the approved categories. Unknown/made-up categories fall back to `Other` instead of creating new dashboard categories.

## Rename and Cleanup Rules

- `Implemented`: `ALMITAS INC INVEST` -> `Rent - Almitas Inc Invest E Consu Lda`
- `Implemented`: `APARECIDA FERNANDA` -> prefix `Cleaning - `
- `Implemented`: `TRF. P/O INES GARDETE LEMOS` and similar variants -> prefix `Brian - `
- `Implemented`: `CAMARA LISBOA CLUBE LISBOA` -> prefix `Monsanto - `
- `Implemented`: `Apple.Com/Bill` with `215 MXN` -> `IG Verification - Servicio Apple.Com/Bill`
- `Implemented`: `Apple.Com/Bill` with `179 MXN` -> `iCloud - Servicio Apple.Com/Bill`
- `Implemented`: `Apple.Com/Bill` with `229 MXN` -> `TextMe - Servicio Apple.Com/Bill`
- `Implemented`: `Apple.Com/Bill` with `399 MXN` -> `GPT - Servicio Apple.Com/Bill`
- `Implemented`: OCR cleanup covers known variants such as `hblp.hbomax.com`, `GRADETE/GADRETE`, and `ANA LEONCASTRE PENHA COSTA`

## Special Amount Rules

- `Implemented`: `Almitas Inc Invest` uses fixed original amount `EUR 600` when the rent rule applies.
- `Implemented`: `APARECIDA FERNANDA` amounts are divided by `3`.
- `Implemented`: `GONCALO DE CAMPOS MELO` Revolut transfers are divided by `3`.

## Bank-Specific Parsing Rules

### Banamex

- `Implemented`: Deterministic parser for Banamex layouts when possible
- `Implemented`: Supports sign on separate line or appended to description
- `Implemented`: Extracts installment notes like `Installment 21/48`
- `Implemented`: Ignores `DIFERIMIENTO DE SALDO APP MOBILE`
- `Implemented`: Groups and ignores `PAGO INTERBANCARIO`

### HSBC

- `Implemented`: Deterministic parser for HSBC 2Now regular movement rows
- `Implemented`: Uses operation date instead of charge date
- `Implemented`: Keeps `MONEDA EXTRANJERA` lines as FX metadata attached to the merchant row, not separate transactions
- `Implemented`: Extracts `INTERESES` and `IVA SOBRE COMISIONES E INTERESES` rows as `Bills/Fees`, including HSBC layouts where the sign/amount is extracted on the following line
- `Implemented`: Image-only HSBC statements use a cropped vision pass over the
  regular-movements table to recover repeated finance-charge rows that the
  broad vision extraction may skip or collapse.

### Millennium

- `Implemented`: Deterministic parser binds each transaction amount to its own
  row and validates income/expense direction against the resulting account
  balance before accepting the row.
- `Implemented`: Millennium statements use `DATA VALOR` as the transaction date.

### Rappi

- `Implemented`: `Compras a meses` uses `Mensualidad` as the actual amount
- `Implemented`: `Compras a meses` rows use the statement period end date as the charged installment date, even when the row's original purchase `Fecha` is from an earlier month/year.
- `Implemented`: Installment columns become notes like `Installment X/Y`
- `Implemented`: Supports both the older Rappi layout and newer Banorte-era `DESGLOSE DE MOVIMIENTOS` layout
- `Implemented`: `IVA INTERES COMPRA EN CUOTAS` -> `Bills/Fees`
- `Implemented`: `PAGO POR SPEI` -> `ignored`

### ARQ / DolarApp

- `Implemented`: Deterministic text parser for ARQ statements
- `Implemented`: ARQ transactions continued on later PDF pages are parsed after first-page summaries and footers
- `Implemented`: Foreign account-currency values are not copied directly into `amount_mxn`
- `Implemented`: `Conversión USDc a EURc` and similar conversions are ignored
- `Implemented`: ARQ imports store audit warnings when date-like transaction
  blocks are skipped or when raw extracted text mentions `Almitas Inc Invest`
  more times than parsed transactions.
- `Implemented`: Original ARQ PDFs can be audited against production imports
  with deterministic row matching by date, canonical description, original
  amount, and original currency. Description-only differences are reported
  separately from truly missing rows.
- `Implemented`: January-May 2026 original ARQ PDFs were audited and 16
  confirmed missing statement rows were restored to production on 2026-06-11.
- `Implemented`: Roommate transfers should be ignored from P&L
- `Implemented`: First dashboard version includes a `Rent & Roommates` panel driven by imported transactions
- `Pending`: Roommate panel should evolve into a fuller reconciliation view for rent and utilities

## Dashboard and UX Rules

- `Implemented`: Review stays in transaction table mode instead of a separate review card/sidebar
- `Implemented`: Add transaction form uses a currency dropdown with `MXN`, `USD`, `EUR`
- `Implemented`: Dashboard includes a global display-currency dropdown for `MXN`, `EUR`, `USD`
- `Implemented`: Notes autosave on blur/debounce
- `Implemented`: Manual transaction edits for category/type override automatic classification.
- `Implemented`: Manual transaction edits can override assigned month/year;
  leaving assigned period blank lets backend rules suggest it.
- `Implemented`: Manual transactions can be marked with source status
  `pending` when the real bank statement has not arrived yet. Pending rows are
  included in normal transaction lists, summaries, category breakdowns, and
  split workflows so receipts can be captured while they are still fresh.
- `Implemented`: Pending manual income/expense transactions can be split while
  they are being added. The app creates one pending source transaction and then
  saves the requested allocations immediately, so the receipt can be captured
  before the bank statement arrives.
- `Implemented`: Deleting a single transaction returns the deleted transaction
  payload to the UI, allowing a short-lived Undo action that recreates the
  transaction and restores split allocations when present.
- `Implemented`: Pending manual transactions are checked against posted
  statement transactions for likely matches. A match requires a manual
  `pending` source transaction, a `posted` candidate, the same transaction type,
  matching original amount/currency when available or matching MXN amount,
  posted date within 45 days after the pending capture, matching bank when both
  rows have one, and overlapping merchant-description tokens.
- `Implemented`: Reconciling a pending/manual transaction against its posted
  statement match changes the pending row to `reconciled_pending` and stores the
  posted transaction id in `matched_transaction_id`. Reconciled pending rows are
  hidden from normal transaction lists and analytics so the same purchase is not
  counted twice.
- `Implemented`: Manual pending transactions appear in a compact Dashboard
  reminder card named `Pending / waiting for statement`, regardless of the
  selected month. The reminder card is for duplicate prevention and editing
  convenience; it does not change selected-period totals, insights, or
  breakdowns.
- `Implemented`: Source status `reconciled_pending` is reserved for a later
  statement-matching workflow and is excluded from normal transaction lists and
  analytics to prevent double counting once a pending capture has been replaced
  by a statement-backed row.
- `Implemented`: Bulk actions can change category and type
- `Implemented`: Bulk type changes can set `income`, `expense`, or `ignored`
- `Implemented`: Transactions with deterministic review reasons remain in Review
  until explicitly marked reviewed or intentionally edited by the user.
- `Implemented`: Notes-only edits do not mark a transaction reviewed.
- `Implemented`: Review supports marking one or multiple selected transactions
  as reviewed.
- `Implemented`: Transactions shown by Dashboard category/type drilldowns can
  be selected, edited, bulk changed, or bulk deleted directly from the
  matching-transactions list.
- `Implemented`: Any visible income or expense transaction row can open Split
  or Edit split, whether or not it is currently in the Review queue.
- `Implemented`: `Tennis Smash & Social` is available as both an income
  category and an expense category, so shared tennis/social costs can be tracked
  separately from standard `Tennis` expenses.
- `Implemented`: Dashboard insights include a compact expandable `Loan Papá`
  reconciliation card. It tracks a 60-installment MXN loan from 2025-05-01
  through 2030-04-01 at `7637.03 MXN` per month. The baseline on 2026-06-12 is
  `93707.33 MXN` paid and `13211.09 MXN` behind; future `Loan Papá` expense
  transactions after that date reduce the behind/remaining balances.
- `Implemented`: A single income or expense transaction can be split across
  two or more unique same-type categories while remaining one source bank
  record.
- `Implemented`: Split allocation amounts must be positive and reconcile
  exactly to the source transaction total. Canonical allocation storage uses
  MXN, with original-currency allocation amounts preserved when available.
- `Implemented`: Dashboard income, expense, net, and savings-rate summaries
  count a split source transaction once. Category breakdowns, category
  averages, and category drilldowns use allocation categories and allocation
  amounts.
- `Implemented`: Category filters include unsplit transactions by source
  category and split transactions by allocation category, without duplicating
  the source transaction in source-total summaries.
- `Implemented`: Saving, editing, or undoing a split is an intentional manual
  decision and marks the source transaction reviewed.
- `Implemented`: Automatic category/type bulk changes and source total/type/
  original-currency edits reject split transactions. Mark-reviewed-only bulk
  actions remain allowed.
- `Implemented`: Undo Split deletes allocation rows only after the user chooses
  a single valid replacement category for the source transaction.
- `Implemented`: Statement delete cascades to linked transactions

## Remembered Personal Rules

- `Implemented`: From the transaction edit modal, a user can choose
  `Remember this selection for similar future transactions`.
- `Implemented`: Moneo stores a personal classification rule using an inferred
  merchant description pattern, the edited transaction's bank, current type,
  and selected target type/category.
- `Implemented`: Remembered rules apply to future transaction normalization and
  imports. They do not automatically change historical transactions.

## Governance

- `Implemented`: Any new transaction rule should update this document
- `Implemented`: Any new bank-specific bug should add or update regression tests
- `Implemented`: Known statement formats should prefer deterministic parsers before GPT

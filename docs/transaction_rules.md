# Transaction Rules

This document is the canonical source of truth for transaction parsing, normalization, classification, and dashboard behavior in `myspendee-gpt`.

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
- `Implemented`: Duplicate detection uses `bank_name + date + amount_mxn + description`.
- `Implemented`: Time filtering supports both a specific month and `YTD`.
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
  - income `<= 30 EUR` -> `Tennis Smash & Social`
  - income `> 30 EUR` -> `Tennis Lessons`
- `Implemented`: `TRF MB WAY DE KIRAH HITCHCOCK` -> `Tennis Smash & Social`
- `Implemented`: `TRF. P/ CAROLINA FREDERICA J GIMENEZ ALBARRAN` -> `Tennis Smash & Social`

## Expense Rules

- `Implemented`: Restaurant and cafe merchants like `FERTONANI CAFE`, `RC SANCHES`, `PANDORCA`, `ENJOY VALUE`, `FEITO PORTUGAL`, `ASUR C CONV SHOP`, `ZHANG YUEMEI`, and similar variants -> `Food & Drink`
- `Implemented`: `BOLT`, `UBR`, `UBER` without EATS, `LIME` -> `Transport`
- `Implemented`: `CONTINENTE`, `PINGO DOCE`, `CELEIRO`, `GLEBA`, `PAGOS FIJOS`, `EL CORTE INGLES`, `LIDL` -> `Groceries`
- `Implemented`: `TENNIS SHOP`, `DECATHLON`, `CLUBE INTERNACIONAL`, `CAMARA LISBOA CLUBE LISBOA`, `TENNIS POINT`, `TP* TENNIS-POINT` -> `Tennis`
- `Implemented`: `AMAZON` or `AMZN` except the ignored `149 MXN` case -> `Home`
- `Implemented`: `ALMITAS INC INVEST` -> `Rent`
- `Implemented`: `GONCALO DE CAMPOS MELO` transfers on Revolut -> `Rent`
- `Implemented`: `APARECIDA FERNANDA` -> `Home`
- `Implemented`: `RITUALS`, `GBMD ... MEDICINA`, `TRF MB WAY P/ FERNANDO ALVES`, `Transfer to FERNANDO CARLOS TEIXEIRA ALVES`, `Transfer to FERNANDO MOTA` and close variants -> `Healthcare`
- `Implemented`: `VODAFONE`, `TELCEL`, `REPAIR`, `M.REPAIR`, `ISHOP MIXUP`, `MACSTORE ...`, matching Apple service rows -> `Phone/Tech`
- `Implemented`: `PAYU *GOOGLE CLOUD`, `ELEVENLABS`, `GOOGLE WORKSPACE` -> `IG Ro Project`
- `Implemented`: `HIGHLEVEL AGENCY SUB`, `CALENDLY`, `PADDLE.NET* ELFSIGHT`, `ELFSIGHT` -> `Perenniam Agency`
- `Implemented`: `NETFLIX`, `CINEMA`, `UCI CINEMAS`, `HBOMAX.COM` and variants -> `Entertainment`
- `Implemented`: `CLUB7`, `CLUBE VII` -> `Gym`
- `Implemented`: `IVA POR INTERESES`, `IVA INTERES`, `INTERES EXENTO`, `INTERES GRAVABLE`, `INTERESES`, `INTERES`, `IMPOSTO SELO`, `COMISION`, `CONTA PACOTE PROGRAMA PRESTIGE` -> `Bills/Fees`
- `Implemented`: `Compra EURc comisión` on ARQ is an expense in `Bills/Fees`
- `Implemented`: `Compra USDc comisión` on ARQ is an expense in `Bills/Fees`
- `Implemented`: `ALGARVEKNOWHOW` -> `Visa Portugal`
- `Implemented`: Unmatched expenses fall back to `Other` with note `Unclassified expense — manual review needed`

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

### Rappi

- `Implemented`: `Compras a meses` uses `Mensualidad` as the actual amount
- `Implemented`: Installment columns become notes like `Installment X/Y`
- `Implemented`: Supports both the older Rappi layout and newer Banorte-era `DESGLOSE DE MOVIMIENTOS` layout
- `Implemented`: `IVA INTERES COMPRA EN CUOTAS` -> `Bills/Fees`
- `Implemented`: `PAGO POR SPEI` -> `ignored`

### ARQ / DolarApp

- `Implemented`: Deterministic text parser for ARQ statements
- `Implemented`: Foreign account-currency values are not copied directly into `amount_mxn`
- `Implemented`: `Conversión USDc a EURc` and similar conversions are ignored
- `Implemented`: Roommate transfers should be ignored from P&L
- `Implemented`: First dashboard version includes a `Rent & Roommates` panel driven by imported transactions
- `Pending`: Roommate panel should evolve into a fuller reconciliation view for rent and utilities

## Dashboard and UX Rules

- `Implemented`: Review stays in transaction table mode instead of a separate review card/sidebar
- `Implemented`: Add transaction form uses a currency dropdown with `MXN`, `USD`, `EUR`
- `Implemented`: Dashboard includes a global display-currency dropdown for `MXN`, `EUR`, `USD`
- `Implemented`: Notes autosave on blur/debounce
- `Implemented`: Bulk actions can change category and type
- `Implemented`: Statement delete cascades to linked transactions

## Governance

- `Implemented`: Any new transaction rule should update this document
- `Implemented`: Any new bank-specific bug should add or update regression tests
- `Implemented`: Known statement formats should prefer deterministic parsers before GPT

# Moneo Financial Clarity Dashboard Design

## Objective

Redesign Moneo around financial clarity while making daily review faster and the
product visually calmer and more premium.

The primary Dashboard question is:

> How am I doing, why, and what needs attention?

## Product Structure

Moneo has three focused workspaces:

1. **Dashboard** explains financial health.
2. **Review** resolves trust issues.
3. **Statements** manages uploaded statements and import history.

The Dashboard no longer carries the full transaction-management workflow.
It includes a compact, filter-aware recent-transactions preview. Detailed
transaction review lives in the dedicated Review workspace.

## Dashboard Hierarchy

The Dashboard presents information in this order:

1. Global filters
2. Prominent review banner
3. Net cash flow and Month Status
4. Income, expenses, and savings-rate KPIs
5. Spending breakdown and income mix
6. Compact recent-transactions preview

This order creates a guided financial story:

1. Can the current dashboard be trusted?
2. How healthy is the current period?
3. What changed?
4. What caused the result?
5. Which transactions explain it?

## Global Filters

The Dashboard has one global filter system:

- Period: month, YTD, or custom range
- Display currency: MXN, EUR, or USD
- Bank
- Activity type

Global filters update every Dashboard metric, comparison, breakdown, status, and
transaction preview.

Clicking a KPI, spending category, or income source adds a visible drill-down
filter to the transaction preview. Applied drill-down filters remain visible and
can be cleared individually or reset together.

The first version does not add independent filters inside each Dashboard
section. This avoids conflicting filter states.

## Review Banner

The review banner is always near the top when review items exist.

It displays:

- Number of transactions needing review
- Total MXN-equivalent value affected
- Short explanation of the most common or material review reasons
- A clear action opening the Review workspace

When the queue is empty, the banner becomes a restrained trust confirmation
rather than disappearing without explanation.

## Financial KPIs And Comparisons

The primary financial KPIs are:

- Net cash flow
- Income
- Expenses
- Savings rate

Net cash flow is the dominant visual anchor.

Income, expenses, and savings rate include:

- A compact arrow and percentage or point change versus the previous month
- Secondary text comparing the value with the recent monthly average

Comparison colors communicate meaning:

- Increased income is positive
- Increased expenses are cautionary
- Decreased expenses are positive
- Changes without a clear positive or negative meaning use neutral styling

Comparison labels always name their basis, such as `vs April` or
`above monthly average`.

## Month Status

Month Status uses four levels:

- **Excellent**
- **Healthy**
- **Watch**
- **Needs Attention**

The user's initial personal savings-rate target is **25%**.

Status uses a transparent combined score based on:

- Positive or negative net cash flow
- Savings rate versus the 25% personal target
- Savings rate versus recent monthly baseline
- Spending drift versus recent monthly baseline
- Review queue count and affected value
- Material unusual-spending signals

Every status includes a concise explanation. Example:

> Healthy: positive net, 36% savings rate, spending near average.

The status must never appear as an unexplained score.

## Spending And Income Analysis

The Dashboard shows:

- **Where the money went**: leading expense categories with values and relative
  contribution
- **Income mix**: leading income sources, including categories such as Tennis
  Rush, Tennis Lessons, and Perenniam Agency

Rows are interactive. Selecting one filters the recent-transactions preview.

The first version prioritizes clear ranked lists and restrained bars over
complex charts. Richer historical trends can follow after the comparison data
model is reliable.

## Review Workspace

The Review workspace is Moneo's trust center.

It defaults to fast triage:

- Compact transaction rows
- Clear review reason
- Category and type actions
- Bulk actions
- Keyboard-friendly navigation and completion

Each row can expand to show:

- Full merchant description
- Date, bank, and statement source
- Original amount and currency
- MXN-equivalent amount and FX details
- Notes
- Existing category and type
- Why Moneo flagged the transaction
- Relevant automatic rule or lack of matching rule

Review reasons include:

- Unclassified
- Higher than usual
- Possible duplicate
- Missing FX
- Unexpected category change

An empty Review workspace confirms that the visible Dashboard is fully trusted
for the selected period.

## Statements Workspace

Statements remains focused on:

- Uploading statement PDFs
- Import status and counts
- Bank and statement-period visibility
- Opening a statement's period in the Dashboard
- Safely deleting a statement and its linked transactions

It does not compete with Dashboard financial insights or Review triage.

## Visual System

The visual direction is **calm premium**:

- Soft neutral application background
- Clean white primary surfaces
- Dark navy structure and navigation
- Restrained semantic colors
- Strong typography hierarchy
- Generous but efficient spacing
- Fewer decorative containers

Semantic color is reserved for:

- Income and positive movement
- Expenses and cautionary movement
- Month Status
- Review alerts

The interface avoids decorative gradients, excessive pills, and dense
accounting-software styling. Controls remain compact and readable.

## Responsive Behavior

Responsive layouts preserve the financial-story order:

1. Review trust signal
2. Net cash flow and Month Status
3. Core KPIs
4. Spending and income analysis
5. Recent transactions

On smaller screens:

- Global filters wrap or collapse without changing their shared scope
- KPI cards stack cleanly
- Spending and income lists stack vertically
- Review actions remain easy to reach
- Dense transaction details move into expandable rows

## Data And Backend Requirements

The Dashboard needs comparison data for:

- Previous equivalent period
- Recent monthly average
- Savings-rate history
- Expense-category baseline
- Income-source baseline

Month Status and unusual-spending signals must use deterministic, documented
logic. They must not depend on unexplained model-generated scores.

The Review workspace needs explicit review-reason metadata. Existing
unclassified/manual-review notes can seed the first version, followed by
deterministic duplicate, FX, unusual-amount, and category-change checks.

## Error And Empty States

- Failed Dashboard data loads show a clear retry action without presenting stale
  status as current.
- Missing comparison history uses neutral copy such as `Not enough history yet`.
- Empty spending or income sections explain why they are empty under the active
  filters.
- Empty Review confirms trust rather than showing a generic blank state.
- Failed review updates keep the item in the queue and explain the failure.

## Testing And Verification

Implementation verification must cover:

- Global filters update all Dashboard sections consistently
- Previous-period and average comparisons use matching date ranges
- Comparison arrows and colors reflect financial meaning
- Month Status explanation matches the underlying inputs
- KPI/category/source drill-down filters the transaction preview
- Review banner opens the Review workspace
- Review reasons and expandable context render correctly
- Bulk and keyboard review actions work
- Dashboard, Review, and Statements work at desktop and mobile widths
- Browser visual QA confirms calm-premium hierarchy and no clipping or overflow

## Delivery Approach

Implement in stages:

1. Dashboard hierarchy, global filters, review banner, and existing-data
   drill-down behavior
2. Previous-period and monthly-average comparison data
3. Transparent Month Status
4. Dedicated Review workspace and explicit review reasons
5. Responsive and premium-polish pass

Each stage must preserve existing transaction rules, statement workflows, and
manual-edit overrides.

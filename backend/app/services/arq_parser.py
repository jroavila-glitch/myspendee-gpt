import re
from datetime import date
from decimal import Decimal
from io import BytesIO

from pypdf import PdfReader


MONTHS = {
    "JAN": 1,
    "FEB": 2,
    "MAR": 3,
    "APR": 4,
    "MAY": 5,
    "JUN": 6,
    "JUL": 7,
    "AUG": 8,
    "SEP": 9,
    "OCT": 10,
    "NOV": 11,
    "DEC": 12,
}

BLOCK_START_RE = re.compile(r"^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2}\b")
PERIOD_START_RE = re.compile(r"^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$")
ROW_RE = re.compile(
    r"^(?P<month>[A-Z][a-z]{2})\s+(?P<day>\d{2})\s+(?P<kind>.+?)\s+"
    r"(?P<amount_sign>[+-])\s*(?P<amount>[\d,]+(?:\.\d+)?)\s+"
    r"(?P<local_currency>[A-Z]{3,4}c?|N/A)\s+"
    r"(?:(?P<local_sign>[+-])\s*(?P<local_amount>[\d,]+(?:\.\d+)?)|N/A)\s+"
    r"(?P<detail>.+)$"
)


def _extract_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(BytesIO(pdf_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _parse_money(value: str) -> Decimal:
    return Decimal(value.replace(",", ""))


def _parse_period_date(raw: str) -> str | None:
    match = PERIOD_START_RE.match(raw.strip())
    if not match:
        return None
    day, month_name, year = match.groups()
    month_key = month_name[:3].upper()
    month = MONTHS.get(month_key)
    if not month:
        return None
    return date(int(year), month, int(day)).isoformat()


def _parse_row_date(month_key: str, day: str, year: int) -> str:
    return date(year, MONTHS[month_key.upper()], int(day)).isoformat()


def _extract_transaction_section(text: str) -> tuple[str, str | None, str | None]:
    marker = "Monto Local \nEquivalente Descripción"
    start = text.find(marker)
    if start < 0:
        return "", None, None

    trailing = text[start + len(marker) :].splitlines()
    period_start = None
    period_end = None
    tx_lines: list[str] = []

    for line in trailing:
        stripped = line.strip()
        if not stripped:
            continue
        parsed_date = _parse_period_date(stripped)
        if parsed_date and period_start is None:
            period_start = parsed_date
            continue
        if parsed_date and period_start is not None and period_end is None:
            period_end = parsed_date
            break
        tx_lines.append(stripped)

    return "\n".join(tx_lines), period_start, period_end


def _parse_blocks(section: str) -> list[str]:
    lines = [re.sub(r"\s+", " ", line).strip() for line in section.splitlines()]
    blocks: list[str] = []
    current: list[str] = []

    for line in lines:
        if not line:
            continue
        if BLOCK_START_RE.match(line):
            if current:
                blocks.append(" ".join(current))
            current = [line]
        elif current:
            current.append(line)

    if current:
        blocks.append(" ".join(current))
    return blocks


def _normalize_currency(value: str, account_currency: str) -> str:
    normalized = value.upper()
    if normalized == "N/A":
        return account_currency
    if normalized == "USDC":
        return "USD"
    if normalized == "EURC":
        return "EUR"
    return normalized


def _build_description(kind: str, detail: str) -> str:
    normalized_kind = re.sub(r"\s+", " ", kind).strip()
    normalized_detail = re.sub(r"\s+", " ", detail).strip()
    lower_detail = normalized_detail.lower()

    if "conversi" in lower_detail or "comision" in lower_detail:
        return normalized_detail
    if normalized_kind.lower() in normalized_detail.lower():
        return normalized_detail
    return f"{normalized_kind} - {normalized_detail}"


def parse_arq_pdf(pdf_bytes: bytes) -> dict | None:
    text = _extract_text(pdf_bytes)
    title_match = re.search(r"^(EURc|USDc) Estado de Cuenta", text, re.IGNORECASE | re.MULTILINE)
    if not title_match:
        return None

    account_currency = "EUR" if title_match.group(1).upper() == "EURC" else "USD"
    section, period_start, period_end = _extract_transaction_section(text)
    if not section:
        return None

    statement_year = int(period_start[:4]) if period_start else date.today().year
    transactions: list[dict] = []

    for block in _parse_blocks(section):
        match = ROW_RE.match(block)
        if not match:
            continue

        amount = _parse_money(match.group("amount"))
        local_amount = _parse_money(match.group("local_amount")) if match.group("local_amount") else None
        local_currency = _normalize_currency(match.group("local_currency"), account_currency)
        detail = match.group("detail").strip()
        description = _build_description(match.group("kind"), detail)
        direction = "in" if match.group("amount_sign") == "+" else "out"

        mxn_amount = None
        if local_amount is not None and local_currency == "MXN":
            mxn_amount = local_amount

        transactions.append(
            {
                "date": _parse_row_date(match.group("month"), match.group("day"), statement_year),
                "description": description,
                "amount_original": float(amount),
                "currency_original": account_currency,
                "direction": direction,
                "exchange_rate": None,
                "local_mxn": float(mxn_amount) if mxn_amount is not None else None,
                "category": "Other",
                "type": "income" if direction == "in" else "expense",
                "notes": detail if description != detail else "",
            }
        )

    return {
        "bank_name": "ARQ",
        "period_start": period_start,
        "period_end": period_end,
        "transactions": transactions,
    }

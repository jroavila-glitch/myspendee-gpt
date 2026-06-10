import re
from datetime import date
from decimal import Decimal

import fitz


PERIOD_RE = re.compile(r"EXTRATO DE (\d{4})/(\d{2})/(\d{2}) A (\d{4})/(\d{2})/(\d{2})", re.IGNORECASE)
ROW_DATE_RE = re.compile(r"^(?P<month>\d{1,2})\.(?P<day>\d{2})$")
MONEY_RE = re.compile(r"^-?\d{1,3}(?: \d{3})*(?:\.\d{2})$")
BALANCE_MARKERS = {"SALDO INICIAL", "TRANSPORTE"}


def _extract_text(pdf_bytes: bytes) -> str:
    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    return "\n".join(page.get_text() for page in document)


def _parse_money(value: str) -> Decimal:
    return Decimal(value.replace(" ", ""))


def _parse_row_date(raw: str, period_start: date, period_end: date) -> str:
    match = ROW_DATE_RE.match(raw)
    if not match:
        raise ValueError(f"Invalid Millennium row date: {raw}")
    month = int(match.group("month"))
    year = period_end.year
    if period_start.year != period_end.year and month >= period_start.month:
        year = period_start.year
    return date(year, month, int(match.group("day"))).isoformat()


def _direction_from_balance(previous: Decimal, amount: Decimal, balance: Decimal) -> str | None:
    if balance - previous == amount:
        return "in"
    if previous - balance == amount:
        return "out"
    return None


def parse_millennium_pdf(pdf_bytes: bytes) -> dict | None:
    text = _extract_text(pdf_bytes)
    if "MILLENNIUM" not in text.upper() or "CONTA MILLENNIUM" not in text.upper():
        return None

    period_match = PERIOD_RE.search(text)
    if not period_match:
        return None
    period_values = [int(value) for value in period_match.groups()]
    period_start = date(*period_values[:3])
    period_end = date(*period_values[3:])
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines() if line.strip()]

    transactions: list[dict] = []
    candidate_rows = 0
    previous_balance: Decimal | None = None
    index = 0
    while index < len(lines):
        line = lines[index]
        if line.upper() in BALANCE_MARKERS and index + 1 < len(lines) and MONEY_RE.match(lines[index + 1]):
            previous_balance = _parse_money(lines[index + 1])
            index += 2
            continue

        if (
            previous_balance is not None
            and ROW_DATE_RE.match(line)
            and index + 1 < len(lines)
            and ROW_DATE_RE.match(lines[index + 1])
        ):
            candidate_rows += 1
            description_start = index + 2
            amount_index = description_start
            while amount_index < len(lines) and not MONEY_RE.match(lines[amount_index]):
                if ROW_DATE_RE.match(lines[amount_index]):
                    break
                amount_index += 1
            if (
                amount_index > description_start
                and amount_index + 1 < len(lines)
                and MONEY_RE.match(lines[amount_index])
                and MONEY_RE.match(lines[amount_index + 1])
            ):
                amount = _parse_money(lines[amount_index])
                balance = _parse_money(lines[amount_index + 1])
                direction = _direction_from_balance(previous_balance, amount, balance)
                if direction:
                    transactions.append(
                        {
                            "date": _parse_row_date(lines[index + 1], period_start, period_end),
                            "description": " ".join(lines[description_start:amount_index]),
                            "amount_original": float(amount),
                            "currency_original": "EUR",
                            "direction": direction,
                            "exchange_rate": None,
                            "local_mxn": None,
                            "category": "Other",
                            "type": "income" if direction == "in" else "expense",
                            "notes": "",
                        }
                    )
                    previous_balance = balance
                    index = amount_index + 2
                    continue
        index += 1

    if not transactions or len(transactions) != candidate_rows:
        raise ValueError("Millennium parser could not validate every transaction row")
    return {
        "bank_name": "Millennium",
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "transactions": transactions,
    }

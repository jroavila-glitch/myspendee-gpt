import re
from io import BytesIO
from datetime import date
from decimal import Decimal

from pypdf import PdfReader

SPANISH_MONTHS = {
    "ENE": 1,
    "FEB": 2,
    "MAR": 3,
    "ABR": 4,
    "MAY": 5,
    "JUN": 6,
    "JUL": 7,
    "AGO": 8,
    "SEP": 9,
    "OCT": 10,
    "NOV": 11,
    "DIC": 12,
}

DATE_RE = r"\d{2}-[A-Za-zÁÉÍÓÚáéíóú]{3}-\d{4}"
ROW_RE = re.compile(
    rf"^\s*({DATE_RE})\s*({DATE_RE})\s*(.+?)([+-])\s*\$?\s*([\d,]+\.\d{{2}})\s*$",
    re.IGNORECASE,
)
PENDING_ROW_RE = re.compile(rf"^\s*({DATE_RE})\s*({DATE_RE})\s*(.+?)\s*$", re.IGNORECASE)
FOREIGN_RE = re.compile(
    r"MONEDA EXTRANJERA:\s*([\d,]+\.\d{2})\s+([A-Z]{3})\s+TC:\s*([\d.]+).*?([+-])\s*\$?\s*([\d,]+\.\d{2})",
    re.IGNORECASE,
)
PERIOD_RE = re.compile(rf"({DATE_RE})\s+al\s+({DATE_RE})", re.IGNORECASE)


def _extract_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(BytesIO(pdf_bytes))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    return _decode_hsbc_text(text)


def _decode_hsbc_text(text: str) -> str:
    # Some HSBC PDFs expose characters as /EX074000 tokens. The first three
    # digits are the ASCII codepoint, so decode them before parsing rows.
    return re.sub(r"/EX(\d{3})000", lambda match: chr(int(match.group(1))), text)


def _parse_money(value: str) -> Decimal:
    return Decimal(value.replace(",", ""))


def _parse_date(value: str) -> date:
    day, month, year = value.split("-")
    return date(int(year), SPANISH_MONTHS[month.upper()], int(day))


def _normalize_description(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _make_transaction(
    *,
    tx_date: date,
    description: str,
    amount_mxn: Decimal,
    sign: str,
    amount_original: Decimal | None = None,
    currency_original: str = "MXN",
    exchange_rate: Decimal | None = None,
) -> dict:
    return {
        "date": tx_date.isoformat(),
        "description": _normalize_description(description),
        "amount_original": amount_original if amount_original is not None else amount_mxn,
        "currency_original": currency_original,
        "direction": "out" if sign == "+" else "in",
        "exchange_rate": exchange_rate,
        "local_mxn": amount_mxn,
        "category": "Other",
        "type": "expense" if sign == "+" else "income",
        "notes": "",
    }


def _parse_regular_movements(text: str) -> list[dict]:
    section_match = re.search(
        r"c\)\s*CARGOS,\s*ABONOS\s*Y\s*COMPRAS\s*REGULARES.*?(?=Total cargos|ATENCI[ÓO]N DE QUEJAS|NOTAS ACLARATORIAS)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if not section_match:
        return []

    rows: list[dict] = []
    pending: tuple[date, str] | None = None
    for raw_line in section_match.group(0).splitlines():
        line = raw_line.strip()
        if not line or line.lower().startswith(("c)", "tarjeta titular", "i. fecha", "operación", "operacion")):
            continue

        if foreign_match := FOREIGN_RE.search(line):
            if not pending:
                continue
            original_amount = _parse_money(foreign_match.group(1))
            currency = foreign_match.group(2).upper()
            exchange_rate = Decimal(foreign_match.group(3))
            sign = foreign_match.group(4)
            amount_mxn = _parse_money(foreign_match.group(5))
            tx_date, description = pending
            rows.append(
                _make_transaction(
                    tx_date=tx_date,
                    description=description,
                    amount_mxn=amount_mxn,
                    sign=sign,
                    amount_original=original_amount,
                    currency_original=currency,
                    exchange_rate=exchange_rate,
                )
            )
            pending = None
            continue

        if row_match := ROW_RE.search(line):
            tx_date = _parse_date(row_match.group(1))
            description = row_match.group(3)
            sign = row_match.group(4)
            amount_mxn = _parse_money(row_match.group(5))
            rows.append(
                _make_transaction(
                    tx_date=tx_date,
                    description=description,
                    amount_mxn=amount_mxn,
                    sign=sign,
                    exchange_rate=Decimal("1"),
                )
            )
            pending = None
            continue

        if pending_match := PENDING_ROW_RE.search(line):
            pending = (_parse_date(pending_match.group(1)), pending_match.group(3))

    return rows


def parse_hsbc_pdf(pdf_bytes: bytes) -> dict | None:
    text = _extract_text(pdf_bytes)
    if "HSBC" not in text.upper() or "2NOW" not in text.upper():
        return None

    period_start = period_end = None
    if period_match := PERIOD_RE.search(text):
        period_start = _parse_date(period_match.group(1)).isoformat()
        period_end = _parse_date(period_match.group(2)).isoformat()

    transactions = _parse_regular_movements(text)
    if not transactions:
        return None

    return {
        "bank_name": "HSBC",
        "period_start": period_start,
        "period_end": period_end,
        "transactions": transactions,
    }

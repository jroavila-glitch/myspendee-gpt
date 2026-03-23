import re
from datetime import date
from decimal import Decimal

import fitz

SPANISH_MONTHS = {
    "ene": 1,
    "feb": 2,
    "mar": 3,
    "abr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "ago": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dic": 12,
}

DATE_RE = re.compile(r"^\d{2}-[a-z]{3}-\d{4}$", re.IGNORECASE)
AMOUNT_RE = re.compile(r"^\$?([\d,]+\.\d{2})$")
TC_RE = re.compile(r"TC1\*\s*([\d.]+)\s*TC2\*\s*([\d.]+)", re.IGNORECASE)
INSTALLMENT_RE = re.compile(r"\b(\d{1,3})\s+de\s+(\d{1,3})\b", re.IGNORECASE)
TRAILING_ID_RE = re.compile(r"\b[A-Z]{2,5}\s?\d{6,}[A-Z0-9]*\b$")


def _parse_spanish_date(value: str) -> date:
    day, month_key, year = value.strip().lower().split("-")
    return date(int(year), SPANISH_MONTHS[month_key[:3]], int(day))


def _parse_period(text: str) -> tuple[str | None, str | None]:
    match = re.search(r"Periodo:\s*(\d{1,2}-[a-z]{3}-\d{4})\s+al\s+(\d{1,2}-[a-z]{3}-\d{4})", text, re.IGNORECASE)
    if not match:
        return None, None
    return _parse_spanish_date(match.group(1)).isoformat(), _parse_spanish_date(match.group(2)).isoformat()


def _detect_banamex_product_name(text: str) -> str:
    upper_text = text.upper()
    if "COSTCO BANAMEX" in upper_text:
        return "Costco Banamex"
    if "ORO BANAMEX" in upper_text:
        return "Oro Banamex"
    if "BANAMEX" in upper_text:
        return "Banamex"
    return "Banamex"


def _clean_line(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _clean_description(lines: list[str]) -> str:
    description = " ".join(_clean_line(line) for line in lines if _clean_line(line))
    description = (
        description.replace("UBR*", "UBER ")
        .replace("UBER   *", "UBER *")
        .replace("BOLT.EUO", "BOLT.EU/O")
        .replace("  ", " ")
    )
    description = TRAILING_ID_RE.sub("", description).strip()
    return re.sub(r"\s+", " ", description).strip()


def _normalize_installment_note(description: str) -> tuple[str, str | None]:
    match = INSTALLMENT_RE.search(description)
    if not match:
        return description, None

    current = int(match.group(1))
    total = int(match.group(2))
    note = f"Installment {current}/{total}"
    cleaned = INSTALLMENT_RE.sub("", description)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned, note


def _rename_banamex_merchant(description: str) -> str:
    replacements = {
        "NETFLIX.COM LOS GATOS NL": "Netflix",
        "PADDLE.NET* ELFSIGHT LONDON GB": "Elfsight",
        "T1 TELCEL PYRE CPA": "Telcel",
        "T1 TELCEL PYRE": "Telcel",
        "TELCEL VPS": "Telcel",
        "ISHOP MIXUP ALTABRISA": "iShop Mixup Altabrisa",
        "PANDORCA.ACTIVIDADES": "Pandorca Actividades",
        "GBMD - MEDICINA DESP": "GBMD - Medicina Desp",
        "SUMUP *FERTONANI CAF": "Sumup - Fertonani Cafe",
        "BOLT.EU/O/": "Bolt ",
        "BOLT.EU/O": "Bolt ",
        "LIME*RIDE GGIP": "Lime Ride",
        "LIME*PASS GGIP": "Lime Pass",
    }

    normalized = description
    for source, target in replacements.items():
        if source in normalized:
            normalized = normalized.replace(source, target)

    cleanup_patterns = {
        r"^Sumup - Fertonani Cafe\b.*$": "Fertonani Cafe",
        r"^GBMD - Medicina Desp\b.*$": "GBMD - Medicina Desp",
        r"^Pandorca Actividades\b.*$": "Pandorca Actividades",
        r"^Lime Ride\b.*$": "Lime Ride",
        r"^Lime Pass\b.*$": "Lime Pass",
        r"^Bolt\b.*$": "Bolt",
        r"^Elfsight\b.*$": "Elfsight",
        r"^Netflix\b.*$": "Netflix",
    }
    for pattern, target in cleanup_patterns.items():
        normalized = re.sub(pattern, target, normalized, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", normalized).strip()


def _parse_decimal(value: str) -> Decimal:
    return Decimal(value.replace("$", "").replace(",", ""))


def _extract_currency(currency_line: str) -> str:
    normalized = currency_line.strip().upper()
    if "EURO" in normalized:
        return "EUR"
    if "DOLLAR" in normalized or "USD" in normalized:
        return "USD"
    return "MXN"


def parse_banamex_pdf(pdf_bytes: bytes) -> dict | None:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    first_page_text = doc[0].get_text()
    if "BANAMEX" not in first_page_text.upper():
        return None

    period_start, period_end = _parse_period(first_page_text)
    product_name = _detect_banamex_product_name(first_page_text)
    transactions: list[dict] = []

    for page in doc:
        lines = [_clean_line(line) for line in page.get_text().splitlines()]
        lines = [line for line in lines if line]
        idx = 0
        while idx < len(lines):
            if not DATE_RE.match(lines[idx]):
                idx += 1
                continue

            op_date = lines[idx]
            if idx + 1 >= len(lines) or not DATE_RE.match(lines[idx + 1]):
                idx += 1
                continue

            charge_date = lines[idx + 1]
            idx += 2
            description_lines: list[str] = []

            while idx < len(lines) and lines[idx] not in {"+", "-"} and not DATE_RE.match(lines[idx]):
                if lines[idx].startswith("Total cargos") or lines[idx].startswith("Total abonos") or lines[idx].startswith("ATENCIÓN DE QUEJAS"):
                    break
                description_lines.append(lines[idx])
                idx += 1

            if idx >= len(lines) or lines[idx] not in {"+", "-"}:
                continue

            sign = lines[idx]
            idx += 1
            if idx >= len(lines) or not AMOUNT_RE.match(lines[idx]):
                continue

            mxn_amount = _parse_decimal(lines[idx])
            idx += 1

            currency_original = "MXN"
            amount_original = mxn_amount
            exchange_rate = Decimal("1.000000")

            if idx < len(lines):
                tc_match = TC_RE.search(lines[idx])
                if tc_match:
                    tc1 = Decimal(tc_match.group(1))
                    tc2 = Decimal(tc_match.group(2))
                    idx += 1
                    currency_line = lines[idx] if idx < len(lines) else "MXN"
                    currency_original = _extract_currency(currency_line)
                    idx += 1
                    if idx < len(lines) and AMOUNT_RE.match(lines[idx]):
                        amount_original = _parse_decimal(lines[idx])
                        idx += 1
                    exchange_rate = tc1 if tc2 == 0 else (tc1 * tc2).quantize(Decimal("0.000001"))

            description = _clean_description(description_lines)
            description, installment_note = _normalize_installment_note(description)
            description = _rename_banamex_merchant(description)
            if sign == "-":
                description = description or "Unknown debit"

            transactions.append(
                {
                    "date": _parse_spanish_date(op_date).isoformat(),
                    "description": description,
                    "amount_original": float(amount_original),
                    "currency_original": currency_original,
                    "direction": "in" if sign == "-" else "out",
                    "exchange_rate": float(exchange_rate),
                    "local_mxn": float(mxn_amount),
                    "category": "Other",
                    "type": "income" if sign == "-" else "expense",
                    "notes": installment_note or "",
                }
            )

    return {
        "bank_name": product_name,
        "period_start": period_start,
        "period_end": period_end,
        "transactions": transactions,
    }

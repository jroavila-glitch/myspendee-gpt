import re
from datetime import date
from decimal import Decimal
from io import BytesIO

from pypdf import PdfReader

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

PERIOD_RE = re.compile(
    r"Periodo facturado\s+(\d{1,2})\s+([a-z]{3})\.\s+(\d{4})\s*-\s*(\d{1,2})\s+([a-z]{3})\.\s+(\d{4})",
    re.IGNORECASE,
)
INSTALLMENT_ROW_RE = re.compile(
    r"^(?P<date>\d{4}-\d{2}-\d{2})\s+(?P<detail>.+?)\s+\$\s*(?P<original>[\d,]+\.\d{2})\s+"
    r"\$\s*(?P<pending>[\d,]+\.\d{2})\s+\$\s*(?P<interest>[\d,]+\.\d{2})\s+"
    r"(?P<current>\d+)\s+de\s+(?P<total>\d+)\s+\$\s*(?P<mensualidad>[\d,]+\.\d{2})$"
)


def _parse_spanish_date(day: str, month_key: str, year: str) -> str:
    return date(int(year), SPANISH_MONTHS[month_key[:3].lower()], int(day)).isoformat()


def _parse_money(value: str) -> Decimal:
    return Decimal(value.replace(",", ""))


def _extract_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(BytesIO(pdf_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _extract_period(text: str) -> tuple[str | None, str | None]:
    match = PERIOD_RE.search(text)
    if not match:
        return None, None
    return (
        _parse_spanish_date(match.group(1), match.group(2), match.group(3)),
        _parse_spanish_date(match.group(4), match.group(5), match.group(6)),
    )


def _extract_installment_section(text: str) -> str:
    start_marker = "Compras a meses\nFecha Más detalle Monto original Pendiente Interés # de Mensualidad Mensualidad"
    end_marker = "\nSubtotal $"
    start = text.find(start_marker)
    if start < 0:
        return ""
    end = text.find(end_marker, start + len(start_marker))
    if end < 0:
        return text[start:]
    return text[start:end]


def _parse_installment_blocks(section: str) -> list[str]:
    lines = [line.rstrip() for line in section.splitlines()]
    blocks: list[str] = []
    current: list[str] = []

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped == "Compras a meses" or stripped.startswith("Fecha Más detalle"):
            continue
        if re.match(r"^\d{4}-\d{2}-\d{2}\b", stripped):
            if current:
                blocks.append(" ".join(current))
            current = [stripped]
        elif current:
            current.append(stripped)

    if current:
        blocks.append(" ".join(current))
    return blocks


def _clean_detail(detail: str) -> tuple[str, str | None]:
    note_parts: list[str] = []
    cleaned = re.sub(r"\s+", " ", detail).strip()
    lowered = cleaned.lower()
    marker = "mensualidad disminuida por pago adelantado"
    if marker in lowered:
        cleaned = re.sub(marker, "", cleaned, flags=re.IGNORECASE).strip(" -")
        note_parts.append("Mensualidad disminuida por pago adelantado")
    return cleaned, ". ".join(note_parts) if note_parts else None


def parse_rappi_pdf(pdf_bytes: bytes) -> dict | None:
    text = _extract_text(pdf_bytes)
    if "RAPPICARD" not in text.upper():
        return None

    period_start, period_end = _extract_period(text)
    section = _extract_installment_section(text)
    if not section:
        return {
            "bank_name": "Rappi",
            "period_start": period_start,
            "period_end": period_end,
            "transactions": [],
        }

    transactions: list[dict] = []
    for block in _parse_installment_blocks(section):
        match = INSTALLMENT_ROW_RE.match(block)
        if not match:
            continue

        detail, extra_note = _clean_detail(match.group("detail"))
        installment_note = f"Installment {match.group('current')}/{match.group('total')}"
        notes = installment_note if not extra_note else f"{installment_note}. {extra_note}"
        mensualidad = _parse_money(match.group("mensualidad"))

        transactions.append(
            {
                "date": match.group("date"),
                "description": detail,
                "amount_original": float(mensualidad),
                "currency_original": "MXN",
                "direction": "out",
                "exchange_rate": 1.0,
                "local_mxn": float(mensualidad),
                "category": "Other",
                "type": "expense",
                "notes": notes,
            }
        )

    return {
        "bank_name": "Rappi",
        "period_start": period_start,
        "period_end": period_end,
        "transactions": transactions,
    }

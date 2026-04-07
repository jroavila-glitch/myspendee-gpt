from pathlib import Path
from decimal import Decimal
from unittest import TestCase
from unittest.mock import patch

from app.services.hsbc_parser import _decode_hsbc_text, _parse_regular_movements, parse_hsbc_pdf


class HSBCParserTest(TestCase):
    def test_regular_movements_use_operation_date_and_parse_interest_rows(self) -> None:
        fixture = Path("backend/tests/fixtures/hsbc_text/hsbc_2now_01_excerpt.txt").read_text()

        rows = _parse_regular_movements(fixture)

        self.assertEqual(17, len(rows))
        self.assertIn(
            {
                "date": "2026-01-15",
                "description": "INTERESES SUJETOS A IVA PROMOCION",
                "amount_original": Decimal("380.03"),
                "currency_original": "MXN",
                "direction": "out",
                "exchange_rate": Decimal("1"),
                "local_mxn": Decimal("380.03"),
                "category": "Other",
                "type": "expense",
                "notes": "",
            },
            rows,
        )
        continente = next(
            row
            for row in rows
            if row["description"] == "CONTINENTE BOM DIA LISBOA PRT" and row["local_mxn"] == Decimal("226.69")
        )
        self.assertEqual("2025-12-31", continente["date"])
        self.assertEqual("EUR", continente["currency_original"])
        self.assertEqual(Decimal("10.67"), continente["amount_original"])
        self.assertEqual(Decimal("21.24554"), continente["exchange_rate"])

    def test_decodes_hsbc_ex_tokens(self) -> None:
        self.assertEqual("JOSE", _decode_hsbc_text("/EX074000/EX079000/EX083000/EX069000"))

    def test_parse_hsbc_pdf_returns_none_without_rows(self) -> None:
        with patch("app.services.hsbc_parser._extract_text", return_value="HSBC 2Now without rows"):
            self.assertIsNone(parse_hsbc_pdf(b"fake"))

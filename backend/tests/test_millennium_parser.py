from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from app.services.millennium_parser import parse_millennium_pdf


FIXTURES = Path(__file__).parent / "fixtures" / "millennium_text"


class MillenniumParserTest(TestCase):
    def test_keeps_adjacent_transfer_amounts_with_their_own_rows(self) -> None:
        text = (FIXTURES / "april_adjacent_transfers.txt").read_text()
        with patch("app.services.millennium_parser._extract_text", return_value=text):
            parsed = parse_millennium_pdf(b"stub")

        assert parsed is not None
        self.assertEqual("Millennium", parsed["bank_name"])
        self.assertEqual("2026-04-01", parsed["period_start"])
        self.assertEqual("2026-04-30", parsed["period_end"])

        jonathan = next(item for item in parsed["transactions"] if "JONATHAN" in item["description"])
        bridge = next(item for item in parsed["transactions"] if "Bridge Building" in item["description"])
        self.assertEqual("2026-04-25", jonathan["date"])
        self.assertEqual(189.0, jonathan["amount_original"])
        self.assertEqual("in", jonathan["direction"])
        self.assertEqual(990.0, bridge["amount_original"])
        self.assertEqual("out", bridge["direction"])

    def test_rejects_a_recognized_statement_when_a_row_breaks_balance_validation(self) -> None:
        text = (FIXTURES / "april_adjacent_transfers.txt").read_text().replace("1 296.58", "1 300.00")
        with patch("app.services.millennium_parser._extract_text", return_value=text):
            with self.assertRaisesRegex(ValueError, "could not validate every transaction row"):
                parse_millennium_pdf(b"stub")

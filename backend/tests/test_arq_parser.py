from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from app.services.arq_parser import parse_arq_pdf


FIXTURES = Path(__file__).parent / "fixtures" / "arq_text"


class ArqParserTest(TestCase):
    def _load_fixture(self, name: str) -> str:
        return (FIXTURES / name).read_text()

    def test_parses_eur_arq_statement_and_preserves_foreign_amounts(self) -> None:
        with patch("app.services.arq_parser._extract_text", return_value=self._load_fixture("eur_arq_2026_01.txt")):
            parsed = parse_arq_pdf(b"stub")

        assert parsed is not None
        self.assertEqual("ARQ", parsed["bank_name"])
        self.assertEqual("2026-01-01", parsed["period_start"])
        self.assertEqual("2026-01-31", parsed["period_end"])

        sebastian = next(item for item in parsed["transactions"] if "Sebastian Wohler" in item["notes"])
        self.assertEqual("EUR", sebastian["currency_original"])
        self.assertEqual(1333.0, sebastian["amount_original"])
        self.assertIsNone(sebastian["local_mxn"])
        self.assertEqual("in", sebastian["direction"])

    def test_parses_second_eur_statement_for_paul_and_rent(self) -> None:
        with patch("app.services.arq_parser._extract_text", return_value=self._load_fixture("eur_arq_2026_02.txt")):
            parsed = parse_arq_pdf(b"stub")

        assert parsed is not None
        self.assertEqual("2026-02-01", parsed["period_start"])
        self.assertEqual("2026-02-28", parsed["period_end"])

        notes = [item["notes"] for item in parsed["transactions"]]
        self.assertTrue(any("PAUL PITTERLEIN" in note.upper() for note in notes if note))
        self.assertTrue(any("Almitas Inc Invest" in note for note in notes if note))

    def test_parses_usd_arq_statement_with_mxn_equivalent_when_present(self) -> None:
        with patch("app.services.arq_parser._extract_text", return_value=self._load_fixture("usd_arq_2026_01.txt")):
            parsed = parse_arq_pdf(b"stub")

        assert parsed is not None
        jose_sale = next(item for item in parsed["transactions"] if item["description"].startswith("Venta USDc") and "Jose Rodrigo Avila Neira" in item["notes"])
        self.assertEqual("USD", jose_sale["currency_original"])
        self.assertEqual(111.8, jose_sale["amount_original"])
        self.assertEqual(2000.0, jose_sale["local_mxn"])
        self.assertEqual("out", jose_sale["direction"])

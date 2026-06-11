from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from app.services.arq_parser import _parse_blocks, parse_arq_pdf


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

    def test_parses_month_end_almitas_rent_row(self) -> None:
        text = self._load_fixture("eur_arq_2026_02.txt").replace(
            "Feb 28 Compra EURc + 210 EUR + 210 FILIP MAREK OLECHOWSKI",
            "Mar 31 Venta EURc - 2,200 EUR - 2,200 Almitas Inc Invest E Consu Lda",
        ).replace("1 February 2026", "1 March 2026").replace("28 February", "31 March")
        with patch("app.services.arq_parser._extract_text", return_value=text):
            parsed = parse_arq_pdf(b"stub")

        assert parsed is not None
        rent = next(item for item in parsed["transactions"] if item["date"] == "2026-03-31")
        self.assertEqual("Venta EURc - Almitas Inc Invest E Consu Lda", rent["description"])
        self.assertEqual(2200.0, rent["amount_original"])
        self.assertEqual("out", rent["direction"])

    def test_warns_when_almitas_text_is_not_parsed_as_transaction(self) -> None:
        text = self._load_fixture("eur_arq_2026_02.txt").replace(
            "Feb 28 Compra EURc + 210 EUR + 210 FILIP MAREK OLECHOWSKI",
            "Mar 31 Venta EURc - 2,200 EUR Almitas Inc Invest E Consu Lda",
        )
        with patch("app.services.arq_parser._extract_text", return_value=text):
            parsed = parse_arq_pdf(b"stub")

        assert parsed is not None
        warnings = parsed.get("audit_warnings", [])
        self.assertTrue(any("Almitas" in warning for warning in warnings))

    def test_parses_usd_arq_statement_with_mxn_equivalent_when_present(self) -> None:
        with patch("app.services.arq_parser._extract_text", return_value=self._load_fixture("usd_arq_2026_01.txt")):
            parsed = parse_arq_pdf(b"stub")

        assert parsed is not None
        jose_sale = next(item for item in parsed["transactions"] if item["description"].startswith("Venta USDc") and "Jose Rodrigo Avila Neira" in item["notes"])
        self.assertEqual("USD", jose_sale["currency_original"])
        self.assertEqual(111.8, jose_sale["amount_original"])
        self.assertEqual(2000.0, jose_sale["local_mxn"])
        self.assertEqual("out", jose_sale["direction"])

    def test_parse_blocks_preserves_wrapped_description_without_page_noise(self) -> None:
        section = "\n".join([
            "Jan 28 Venta USDc - 232.47 MXN - 4,000 Jose Rodrigo",
            "Avila Neira",
            "Si necesita ayuda contáctanos en help.com Página 2 de 3",
            "legal footer text",
        ])

        self.assertEqual(
            ["Jan 28 Venta USDc - 232.47 MXN - 4,000 Jose Rodrigo Avila Neira"],
            _parse_blocks(section),
        )

    def test_parses_transactions_continued_after_first_page_summary(self) -> None:
        with patch("app.services.arq_parser._extract_text", return_value=self._load_fixture("usd_arq_2026_01.txt")):
            parsed = parse_arq_pdf(b"stub")

        assert parsed is not None
        continued_sale = next(
            item
            for item in parsed["transactions"]
            if item["date"] == "2026-01-28" and "Jose Rodrigo Avila Neira" in item["notes"]
        )
        self.assertEqual(232.47, continued_sale["amount_original"])
        self.assertEqual(4000.0, continued_sale["local_mxn"])
        self.assertEqual("Jose Rodrigo Avila Neira", continued_sale["notes"])

    def test_parses_new_digital_usd_arq_statement_layout(self) -> None:
        with patch("app.services.arq_parser._extract_text", return_value=self._load_fixture("usd_arq_2026_05_digital.txt")):
            parsed = parse_arq_pdf(b"stub")

        assert parsed is not None
        self.assertEqual("ARQ", parsed["bank_name"])
        self.assertEqual("2026-05-01", parsed["period_start"])
        self.assertEqual("2026-05-31", parsed["period_end"])

        juan_sale = next(item for item in parsed["transactions"] if item["description"].startswith("Venta USDc") and "Juan Avila" in item["notes"])
        self.assertEqual("USD", juan_sale["currency_original"])
        self.assertEqual(28.0, juan_sale["amount_original"])
        self.assertIsNone(juan_sale["local_mxn"])
        self.assertEqual("out", juan_sale["direction"])

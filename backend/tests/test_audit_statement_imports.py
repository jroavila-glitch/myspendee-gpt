from unittest import TestCase

from scripts.audit_statement_imports import AuditRow


class AuditStatementImportsTest(TestCase):
    def test_canonicalizes_arq_almitas_rent_for_matching(self) -> None:
        row = AuditRow.from_extracted(
            {
                "date": "2026-03-31",
                "description": "Venta EURc - Almitas Inc Invest E Consu Lda",
                "amount_original": 2200,
                "currency_original": "EUR",
            },
            "ARQ",
        )

        self.assertEqual("RENT - ALMITAS INC INVEST E CONSU LDA", row.description)
        self.assertEqual("600.00", row.amount_original)

    def test_loose_key_ignores_description_for_existing_row_mismatch_reports(self) -> None:
        row = AuditRow(
            date="2026-04-10",
            bank_name="ARQ",
            description="COMPRA USDC - CONTINI SOLUTIONS INC",
            amount_original="450.00",
            currency_original="USD",
        )

        self.assertEqual(("2026-04-10", "ARQ", "450.00", "USD"), row.loose_key)

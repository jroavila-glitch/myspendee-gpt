from decimal import Decimal
from unittest import TestCase

from app.services.normalization import normalize_bank_name, resolve_amounts


class NormalizationRulesTest(TestCase):
    def test_millennium_name_is_normalized(self) -> None:
        self.assertEqual("Millennium", normalize_bank_name("Millenium BCP"))
        self.assertEqual("Millennium", normalize_bank_name("Millennium BCP"))

    def test_arq_name_is_normalized(self) -> None:
        self.assertEqual("ARQ", normalize_bank_name("DÓLARAPP MÉXICO S.A. DE C.V."))
        self.assertEqual("ARQ", normalize_bank_name("ARQ"))

    def test_arq_guard_avoids_one_to_one_foreign_to_mxn_copy(self) -> None:
        original, mxn_amount, rate, _ = resolve_amounts(
            bank_name="ARQ",
            description="Compra EURc - Sebastian Wohler",
            currency_original="EUR",
            amount_original=Decimal("1333"),
            amount_mxn=Decimal("1333"),
            exchange_rate_used=None,
            local_mxn=None,
        )
        self.assertEqual(Decimal("1333.00"), original)
        self.assertEqual(Decimal("28659.50"), mxn_amount)
        self.assertEqual(Decimal("21.500000"), rate)

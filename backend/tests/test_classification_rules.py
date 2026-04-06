from decimal import Decimal
from unittest import TestCase

from app.services.classification import apply_special_description_rules, classify_transaction


class ClassificationRulesTest(TestCase):
    def test_honos_maps_to_azulik_income(self) -> None:
        tx_type, category, _ = classify_transaction(
            description="C COMBINATOR MEXICO / HONOS payout",
            amount_mxn=Decimal("1000"),
            bank_name="Revolut",
            amount_original=Decimal("50"),
            currency_original="EUR",
        )
        self.assertEqual(("income", "Azulik"), (tx_type, category))

    def test_kirah_hitchcock_is_tennis_smash_and_social(self) -> None:
        tx_type, category, _ = classify_transaction(
            description="TRF MB WAY DE KIRAH HITCHCOCK",
            amount_mxn=Decimal("420"),
            bank_name="Millennium",
            amount_original=Decimal("20"),
            currency_original="EUR",
        )
        self.assertEqual(("income", "Tennis Smash & Social"), (tx_type, category))

    def test_almitas_is_rent_expense(self) -> None:
        tx_type, category, _ = classify_transaction(
            description="Rent - Almitas Inc Invest E Consu Lda",
            amount_mxn=Decimal("12900"),
            bank_name="ARQ",
            amount_original=Decimal("600"),
            currency_original="EUR",
        )
        self.assertEqual(("expense", "Rent"), (tx_type, category))

    def test_fernando_mota_transfer_is_healthcare(self) -> None:
        tx_type, category, _ = classify_transaction(
            description="Transfer to FERNANDO MOTA",
            amount_mxn=Decimal("300"),
            bank_name="Revolut",
            amount_original=Decimal("15"),
            currency_original="EUR",
        )
        self.assertEqual(("expense", "Healthcare"), (tx_type, category))

    def test_sebastian_note_triggers_ignore(self) -> None:
        tx_type, category, _ = classify_transaction(
            description="Compra EURc",
            amount_mxn=Decimal("28659.50"),
            bank_name="ARQ",
            amount_original=Decimal("1333"),
            currency_original="EUR",
            notes="Sebastian Wohler",
        )
        self.assertEqual(("ignored", "ignored"), (tx_type, category))

    def test_apple_399_gets_gpt_rename(self) -> None:
        description, _ = apply_special_description_rules(
            "Apple.Com/Bill",
            Decimal("399"),
            "Oro Banamex",
        )
        self.assertEqual("GPT - Servicio Apple.Com/Bill", description)

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

    def test_arq_compra_eurc_comision_is_bills_and_fees(self) -> None:
        tx_type, category, _ = classify_transaction(
            description="Compra EURc comisión",
            amount_mxn=Decimal("61.88"),
            bank_name="ARQ",
            amount_original=Decimal("3"),
            currency_original="EUR",
        )
        self.assertEqual(("expense", "Bills/Fees"), (tx_type, category))

    def test_arq_compra_usdc_comision_is_bills_and_fees(self) -> None:
        tx_type, category, _ = classify_transaction(
            description="Compra USDc comisión",
            amount_mxn=Decimal("53.70"),
            bank_name="ARQ",
            amount_original=Decimal("3"),
            currency_original="USD",
        )
        self.assertEqual(("expense", "Bills/Fees"), (tx_type, category))

    def test_dolarapp_sent_from_arq_is_ignored(self) -> None:
        tx_type, category, _ = classify_transaction(
            description="Dolarapp Mexico, S.A. de C.V. Sent from ARQ",
            amount_mxn=Decimal("1200"),
            bank_name="ARQ",
            amount_original=Decimal("60"),
            currency_original="EUR",
        )
        self.assertEqual(("ignored", "ignored"), (tx_type, category))

    def test_unknown_imported_categories_fall_back_to_other(self) -> None:
        tx_type, category, notes = classify_transaction(
            description="Unrecognized merchant",
            amount_mxn=Decimal("1200"),
            bank_name="Unknown Bank",
            current_type="expense",
            current_category="Made Up Category",
        )
        self.assertEqual(("expense", "Other"), (tx_type, category))
        self.assertIsNone(notes)

    def test_known_imported_categories_are_preserved(self) -> None:
        tx_type, category, notes = classify_transaction(
            description="Unrecognized merchant",
            amount_mxn=Decimal("1200"),
            bank_name="Unknown Bank",
            current_type="expense",
            current_category="Travel",
        )
        self.assertEqual(("expense", "Travel"), (tx_type, category))
        self.assertIsNone(notes)

    def test_claude_anthropic_is_ig_ro_project(self) -> None:
        for description in ["CLAUDE.AI SUBSCRIPTION ANTHROPIC.COMCA", "ANTHROPIC ANTHROPIC.COMCA"]:
            with self.subTest(description=description):
                tx_type, category, _ = classify_transaction(
                    description=description,
                    amount_mxn=Decimal("355.61"),
                    bank_name="Costco Banamex",
                    amount_original=Decimal("20"),
                    currency_original="USD",
                )
                self.assertEqual(("expense", "IG Ro Project"), (tx_type, category))

    def test_apple_399_gets_gpt_rename(self) -> None:
        description, _ = apply_special_description_rules(
            "Apple.Com/Bill",
            Decimal("399"),
            "Oro Banamex",
        )
        self.assertEqual("GPT - Servicio Apple.Com/Bill", description)

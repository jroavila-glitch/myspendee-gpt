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

    def test_exact_25_eur_income_from_tennis_banks_is_tennis_rush(self) -> None:
        for bank_name in ["Millennium", "Revolut"]:
            with self.subTest(bank_name=bank_name):
                tx_type, category, _ = classify_transaction(
                    description="Transfer from tennis player",
                    amount_mxn=Decimal("537.50"),
                    bank_name=bank_name,
                    amount_original=Decimal("25"),
                    currency_original="EUR",
                    current_type="income",
                )
                self.assertEqual(("income", "Tennis Rush"), (tx_type, category))

    def test_named_tennis_income_rule_precedes_exact_25_eur_rule(self) -> None:
        tx_type, category, _ = classify_transaction(
            description="Transfer from ROMAN JERZY SOBKOWIAK",
            amount_mxn=Decimal("537.50"),
            bank_name="Revolut",
            amount_original=Decimal("25"),
            currency_original="EUR",
            current_type="income",
        )
        self.assertEqual(("income", "Ro IG Tennis"), (tx_type, category))

    def test_named_smash_and_social_rules_precede_exact_25_eur_rule(self) -> None:
        for description in [
            "TRF MB WAY DE KIRAH HITCHCOCK",
            "TRF. P/ CAROLINA FREDERICA J GIMENEZ ALBARRAN",
        ]:
            with self.subTest(description=description):
                tx_type, category, _ = classify_transaction(
                    description=description,
                    amount_mxn=Decimal("537.50"),
                    bank_name="Millennium",
                    amount_original=Decimal("25"),
                    currency_original="EUR",
                    current_type="income",
                )
                self.assertEqual(("income", "Tennis Smash & Social"), (tx_type, category))

    def test_named_income_rules_precede_exact_25_eur_rule(self) -> None:
        cases = [
            ("FILIP MAREK", "Tennis Lessons"),
            ("CONTINI SOLUTIONS", "Perenniam Agency"),
            ("HONOS payout", "Azulik"),
        ]
        for description, expected_category in cases:
            with self.subTest(description=description):
                tx_type, category, _ = classify_transaction(
                    description=description,
                    amount_mxn=Decimal("537.50"),
                    bank_name="Revolut",
                    amount_original=Decimal("25"),
                    currency_original="EUR",
                    current_type="income",
                )
                self.assertEqual(("income", expected_category), (tx_type, category))

    def test_tennis_rush_only_matches_exactly_25_eur(self) -> None:
        for amount in [Decimal("24.99"), Decimal("25.01")]:
            with self.subTest(amount=amount):
                tx_type, category, _ = classify_transaction(
                    description="Transfer from tennis player",
                    amount_mxn=Decimal("537.50"),
                    bank_name="Revolut",
                    amount_original=amount,
                    currency_original="EUR",
                    current_type="income",
                )
                self.assertEqual(("income", "Tennis Smash & Social"), (tx_type, category))

    def test_clube_vii_variants_are_food_unless_exactly_110_eur(self) -> None:
        for description in ["CLUBE VII LISBOA PT", "UNITENIS LISBOA PT", "CLUBE VII", "Club7"]:
            with self.subTest(description=description):
                tx_type, category, _ = classify_transaction(
                    description=description,
                    amount_mxn=Decimal("107.50"),
                    bank_name="Millennium",
                    amount_original=Decimal("5"),
                    currency_original="EUR",
                    current_type="expense",
                )
                self.assertEqual(("expense", "Food & Drink"), (tx_type, category))

    def test_clube_vii_exactly_110_eur_is_gym(self) -> None:
        tx_type, category, _ = classify_transaction(
            description="CLUBE VII LISBOA PT",
            amount_mxn=Decimal("2365"),
            bank_name="Millennium",
            amount_original=Decimal("110"),
            currency_original="EUR",
            current_type="expense",
        )
        self.assertEqual(("expense", "Gym"), (tx_type, category))

    def test_club7_exactly_120_eur_is_gym(self) -> None:
        tx_type, category, _ = classify_transaction(
            description="Club7 monthly membership",
            amount_mxn=Decimal("2580"),
            bank_name="Revolut",
            amount_original=Decimal("120"),
            currency_original="EUR",
            current_type="expense",
        )
        self.assertEqual(("expense", "Gym"), (tx_type, category))

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

    def test_jose_roberto_arq_transfers_are_loan_papa_expenses(self) -> None:
        for description in [
            "Venta EURc - Jose Roberto Avila Mayor",
            "Transfer to JOSE ROBERTO AVILA",
        ]:
            with self.subTest(description=description):
                tx_type, category, _ = classify_transaction(
                    description=description,
                    amount_mxn=Decimal("5000"),
                    bank_name="ARQ",
                    amount_original=Decimal("245.88"),
                    currency_original="EUR",
                )
                self.assertEqual(("expense", "Loan Papá"), (tx_type, category))

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

    def test_obsidian_variants_are_ig_ro_project(self) -> None:
        for description in ["OBSIDIAN", "OBSIDIAN.MD", "OBSIDIAN SYNC"]:
            with self.subTest(description=description):
                tx_type, category, _ = classify_transaction(
                    description=description,
                    amount_mxn=Decimal("180"),
                    bank_name="Oro Banamex",
                    current_type="expense",
                )
                self.assertEqual(("expense", "IG Ro Project"), (tx_type, category))

    def test_spotify_variants_are_entertainment(self) -> None:
        for description in ["MUSICSPOTIFY", "SPOTIFY", "SPOTIFY P2D"]:
            with self.subTest(description=description):
                tx_type, category, _ = classify_transaction(
                    description=description,
                    amount_mxn=Decimal("129"),
                    bank_name="Oro Banamex",
                    current_type="expense",
                )
                self.assertEqual(("expense", "Entertainment"), (tx_type, category))

    def test_aeromexico_variants_are_travel(self) -> None:
        for description in ["AEROMEXICO", "AERO MEXICO", "AEROVIAS DE MEXICO"]:
            with self.subTest(description=description):
                tx_type, category, _ = classify_transaction(
                    description=description,
                    amount_mxn=Decimal("2500"),
                    bank_name="Oro Banamex",
                    current_type="expense",
                )
                self.assertEqual(("expense", "Travel"), (tx_type, category))

    def test_monsanto_court_variants_are_monsanto_courts(self) -> None:
        for description in [
            "COMPRA CAMARA LISBOA",
            "CAMARA LISBOA CLUBE LISBOA",
            "Compra Câmara Lisboa",
        ]:
            with self.subTest(description=description):
                tx_type, category, _ = classify_transaction(
                    description=description,
                    amount_mxn=Decimal("420"),
                    bank_name="Millennium",
                    amount_original=Decimal("20"),
                    currency_original="EUR",
                    current_type="expense",
                )
                self.assertEqual(("expense", "Monsanto courts"), (tx_type, category))

    def test_apple_399_gets_gpt_rename(self) -> None:
        description, _ = apply_special_description_rules(
            "Apple.Com/Bill",
            Decimal("399"),
            "Oro Banamex",
        )
        self.assertEqual("GPT - Servicio Apple.Com/Bill", description)

    def test_monsanto_court_variants_get_monsanto_prefix(self) -> None:
        for raw_description in ["COMPRA CAMARA LISBOA", "CAMARA LISBOA CLUBE LISBOA"]:
            with self.subTest(raw_description=raw_description):
                description, _ = apply_special_description_rules(
                    raw_description,
                    Decimal("420"),
                    "Millennium",
                )
                self.assertEqual(f"Monsanto - {raw_description}", description)

from decimal import Decimal, ROUND_HALF_UP

from app.services.classification import normalize_text

FALLBACK_RATES = {
    ("EUR", "REVOLUT"): Decimal("21.5"),
    ("EUR", "MILLENNIUM BCP"): Decimal("21.5"),
    ("USD", "REVOLUT"): Decimal("17.9"),
    ("USD", "DOLARAPP"): Decimal("17.9"),
}


def quantize_money(value: Decimal | int | float | str) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def quantize_rate(value: Decimal | int | float | str) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)


def resolve_exchange_rate(bank_name: str, currency_original: str, exchange_rate: Decimal | None) -> Decimal | None:
    if exchange_rate and exchange_rate > 0:
        return quantize_rate(exchange_rate)
    if currency_original == "MXN":
        return Decimal("1.000000")

    normalized_bank = normalize_text(bank_name)
    for (currency, bank_fragment), fallback in FALLBACK_RATES.items():
        if currency_original == currency and bank_fragment in normalized_bank:
            return fallback
    return None


def resolve_amounts(
    *,
    bank_name: str,
    description: str,
    currency_original: str,
    amount_original: Decimal | None,
    amount_mxn: Decimal | None,
    exchange_rate_used: Decimal | None,
    local_mxn: Decimal | None = None,
) -> tuple[Decimal | None, Decimal, Decimal | None, str | None]:
    normalized_description = normalize_text(description)
    notes = None

    rate = resolve_exchange_rate(bank_name, currency_original, exchange_rate_used)
    mxn_amount = quantize_money(local_mxn if local_mxn is not None else amount_mxn) if (local_mxn is not None or amount_mxn is not None) else None
    original = quantize_money(amount_original) if amount_original is not None else None

    if "ALMITAS INC INVEST" in normalized_description:
        original = Decimal("600.00")

    if original is None and mxn_amount is not None and rate and rate > 0 and currency_original != "MXN":
        original = quantize_money(mxn_amount / rate)

    if mxn_amount is None and original is not None:
        if currency_original == "MXN":
            mxn_amount = original
            rate = Decimal("1.000000")
        elif rate:
            mxn_amount = quantize_money(original * rate)

    if mxn_amount is None:
        raise ValueError("Unable to resolve MXN amount for transaction")

    if "APARECIDA FERNANDA" in normalized_description or (
        "GONCALO DE CAMPOS MELO" in normalized_description and "REVOLUT" in normalize_text(bank_name)
    ):
        mxn_amount = quantize_money(mxn_amount / Decimal("3"))
        if original is not None:
            original = quantize_money(original / Decimal("3"))

    return original, mxn_amount, rate, notes

from decimal import Decimal, ROUND_HALF_UP

from app.services.classification import normalize_text

FALLBACK_RATES = {
    ("EUR", "REVOLUT"): Decimal("21.5"),
    ("EUR", "MILLENNIUM"): Decimal("21.5"),
    ("EUR", "ARQ"): Decimal("21.5"),
    ("EUR", "DOLARAPP"): Decimal("21.5"),
    ("USD", "REVOLUT"): Decimal("17.9"),
    ("USD", "MILLENNIUM"): Decimal("17.9"),
    ("USD", "ARQ"): Decimal("17.9"),
    ("USD", "DOLARAPP"): Decimal("17.9"),
}

CURRENCY_ALIASES = {
    "USDC": "USD",
    "EURC": "EUR",
}


def normalize_bank_name(bank_name: str) -> str:
    normalized = normalize_text(bank_name)
    if normalized == "NU" or normalized.startswith("NU ") or "NU MEXICO" in normalized:
        return "Nu"
    if "ARQ" in normalized or "DOLARAPP" in normalized:
        return "ARQ"
    if "HSBC" in normalized:
        return "HSBC"
    if "MILLENIUM" in normalized or "MILLENNIUM" in normalized:
        return "Millennium BCP"
    if "REVOLUT" in normalized:
        return "Revolut"
    return bank_name


def quantize_money(value: Decimal | int | float | str) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def quantize_rate(value: Decimal | int | float | str) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)


def resolve_exchange_rate(bank_name: str, currency_original: str, exchange_rate: Decimal | None) -> Decimal | None:
    currency_original = CURRENCY_ALIASES.get(currency_original.upper(), currency_original.upper())
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
    normalized_currency = CURRENCY_ALIASES.get(currency_original.upper(), currency_original.upper())

    rate = resolve_exchange_rate(bank_name, normalized_currency, exchange_rate_used)
    mxn_amount = quantize_money(local_mxn if local_mxn is not None else amount_mxn) if (local_mxn is not None or amount_mxn is not None) else None
    original = quantize_money(amount_original) if amount_original is not None else None

    if (
        "ARQ" in normalize_text(bank_name)
        and normalized_currency != "MXN"
        and original is not None
        and mxn_amount is not None
        and mxn_amount == original
    ):
        mxn_amount = None

    if "ALMITAS INC INVEST" in normalized_description:
        original = Decimal("600.00")

    if rate is None and original is not None and mxn_amount is not None and normalized_currency != "MXN" and original > 0:
        rate = quantize_rate(mxn_amount / original)

    if original is None and mxn_amount is not None and rate and rate > 0 and normalized_currency != "MXN":
        original = quantize_money(mxn_amount / rate)

    if mxn_amount is None and original is not None:
        if normalized_currency == "MXN":
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

import re
import unicodedata
from decimal import Decimal

IGNORE_PATTERNS = [
    "MACSTORE MERIDA",
    "PAGO INTERBANCARIO",
    "PAY PAL*ADOBE",
    "SU PAGO GRACIAS",
    "SEBASTIAN WOHLER",
    "PAUL PITTERLEIN",
    "JOSE RODRIGO AVILA NEIRA",
    "PAGO A TU TARJETA DE CREDITO",
    "SENT FROM DOLARAPP",
    "PATRICIA NEIRA",
    "ARTURO PASTRANA",
    "INTERNATIONAL TRANSFER TO JOSE RODRIGO AVILA NEIRA",
    "PAGO POR SPEI",
    "CONVERSION USDC A EURC",
    "TRF P/ BRIDGE BUILDING",
    "BRIDGE BUILDING",
    "DIFERIMIENTO DE SALDO APP MOBILE",
    "COMPRA EURC COMISION",
    "VENTA EURC COMISION",
    "COMPRA USDC COMISION",
    "EXCHANGED TO EUR",
]

INCOME_RULES = [
    (r"CONTINI SOLUTIONS", ("income", "Perenniam Agency")),
    (r"FILIP MAREK", ("income", "Tennis Lessons")),
    (r"BONIFICACI[ÓO]N CON CASHBACK", ("income", "Credit Cards Cashback")),
    (r"C COMBINATOR MEXICO|HONOS", ("income", "Other")),
]

EXPENSE_RULES = [
    (
        r"UBER\s*\*?\s*EATS|PIZZA|PIZZERIA|CAFE|CAFÉ|CAFF[EÈ]|KAFFE|SHIFU RAMEN|JNCQUOI ASIA|STREET CHOW|"
        r"SUMUP \*|FERTONANI CAFE|RC\.?\s*SANCHES|R\.?C\.?SANCHES|PANDORCA|PANORCA|PANDORCA ACTIVIDADES|"
        r"ENJOY VALUE|FEITO PORTUGAL|ASUR C CONV SHOP|ASUR CONV SHOP|QUESTAO RECHEADA|THANKYOUMAMA|ROTA GOURMET",
        "Food & Drink",
    ),
    (r"BOLT|BOLT\.EU|UBR|UBER(?!.*EATS)|UBER \*ONE MEMBERSHI|LIME", "Transport"),
    (r"CONTINENTE|PINGO DOCE|CELEIRO|GLEBA|PAGOS FIJOS|EL CORTE INGLES|LIDL", "Groceries"),
    (r"TENNIS SHOP|DECATHLON|CLUBE INTERNACIONAL|CAMARA LISBOA CLUBE LISBOA|TENNIS POINT|TP\* TENNIS-POINT", "Tennis"),
    (r"AMAZON|AMZN|ALMITAS INC INVEST|APARECIDA FERNANDA|GONCALO DE CAMPOS MELO", "Home"),
    (r"RITUALS|GBMD.+MEDICINA|TRF MB WAY P/ FERNANDO ALVES", "Healthcare"),
    (r"VODAFONE|TELCEL|REPAIR|M\.REPAIR|ISHOP MIXUP|MACSTORE FORUM CUERNAV|MACSTORE CIB III|APPLE\.COM/BILL", "Phone/Tech"),
    (r"PAYU \*GOOGLE CLOUD|ELEVENLABS|GOOGLE WORKSPACE|GOOGLE \*WORKSPACE", "IG Ro Project"),
    (r"HIGHLEVEL AGENCY SUB|CALENDLY|PADDLE\.NET\* ELFSIGHT|ELFSIGHT", "Perenniam Agency"),
    (r"NETFLIX|CINEMA|UCI CINEMAS|H[BE][A-Z]*\.?HBOMAX\.COM|HBOMAX\.COM", "Entertainment"),
    (r"CLUB7|CLUBE VII", "Gym"),
    (r"CONTA PACOTE PROGRAMA PRESTIGE|IVA POR INTERESES|IVA INTERES|INTERES EXENTO|INTERES GRAVABLE|INTERESES|INTERES|IMPOSTO SELO|COMISION", "Bills/Fees"),
    (r"ALGARVEKNOWHOW", "Visa Portugal"),
    (r"FUNDEDNEXT", "Other"),
]


def normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_text = "".join(char for char in normalized if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", ascii_text.upper()).strip()


def apply_special_description_rules(description: str, amount_mxn: Decimal, bank_name: str) -> tuple[str, str | None]:
    normalized = normalize_text(description)
    notes = None
    cleaned_description = description
    cleaned_description = re.sub(r"^(Brian - )+", "Brian - ", cleaned_description)
    cleaned_description = re.sub(r"^(Monsanto - )+", "Monsanto - ", cleaned_description)
    cleaned_description = re.sub(r"^(Cleaning - )+", "Cleaning - ", cleaned_description)
    cleaned_description = re.sub(r"hblp\.hbomax\.com", "help.hbomax.com", cleaned_description, flags=re.IGNORECASE)
    cleaned_description = re.sub(r"INES\s+G[AR]?RADETE\s+LEMOS", "INES GARDETE LEMOS", cleaned_description, flags=re.IGNORECASE)
    cleaned_description = re.sub(r"ANA\s+LEONCASTRE\s+PENHA\s+COSTA", "JOANA LANCASTRE PENHA COSTA", cleaned_description, flags=re.IGNORECASE)
    description = cleaned_description
    normalized = normalize_text(description)
    if "ALMITAS INC INVEST" in normalized:
        return "Rent - Almitas Inc Invest E Consu Lda", notes
    if "APARECIDA FERNANDA" in normalized and not normalized.startswith("CLEANING -"):
        return f"Cleaning - {description}", notes
    if (
        "TRF. P/O INES GARDETE LEMOS" in normalized
        or "TRF P/O INES GARDETE LEMOS" in normalized
        or "TRF. P/ INES GARDETE LEMOS" in normalized
        or "TRF P/ INES GARDETE LEMOS" in normalized
    ) and not normalized.startswith("BRIAN -"):
        return f"Brian - {description}", notes
    if "CAMARA LISBOA CLUBE LISBOA" in normalized and not normalized.startswith("MONSANTO -"):
        return f"Monsanto - {description}", notes
    if "BONIFIC" in normalized and bank_name.lower().startswith("rappi"):
        return "RappiCard - BONIFICACIÓN CON CASHBACK", notes
    if "APPLE.COM/BILL" in normalized:
        if amount_mxn == Decimal("215"):
            return "IG Verification - Servicio Apple.Com/Bill", notes
        if amount_mxn == Decimal("179"):
            return "iCloud - Servicio Apple.Com/Bill", notes
        if amount_mxn == Decimal("229"):
            return "TextMe - Servicio Apple.Com/Bill", notes
    return description, notes


def classify_transaction(
    description: str,
    amount_mxn: Decimal,
    bank_name: str,
    amount_original: Decimal | None = None,
    currency_original: str | None = None,
    current_type: str | None = None,
    current_category: str | None = None,
) -> tuple[str, str, str | None]:
    normalized = normalize_text(description)
    normalized_bank = normalize_text(bank_name)
    normalized_currency = normalize_text(currency_original or "MXN")

    threshold_amount = amount_original if amount_original is not None else amount_mxn
    is_tennis_bank = "REVOLUT" in normalized_bank or "MILLENNIUM" in normalized_bank
    looks_like_person_transfer_income = (
        "MILLENNIUM" in normalized_bank and (
            normalized.startswith("TRF P/")
            or normalized.startswith("TRF P/O")
            or normalized.startswith("TRF. P/")
            or normalized.startswith("TRF. P/O")
            or normalized.startswith("TRF DE ")
            or normalized.startswith("TRF MB WAY DE ")
            or normalized.startswith("BRIAN - TRF P/O")
            or normalized.startswith("BRIAN - TRF. P/O")
        )
    ) or "TRANSFER FROM" in normalized or normalized.startswith("TRF MB WAY DE ")

    if "AMAZON" in normalized and amount_mxn == Decimal("149"):
        return "ignored", "ignored", None

    if any(pattern in normalized for pattern in IGNORE_PATTERNS):
        return "ignored", "ignored", None

    if "TRANSFER TO FERNANDO CARLOS TEIXEIRA ALVES" in normalized or "TRF MB WAY P/ FERNANDO ALVES" in normalized:
        return "expense", "Healthcare", None

    if is_tennis_bank and ("ROMAN JERZY SOBKOWIAK" in normalized):
        return "income", "Ro IG Tennis", None

    if is_tennis_bank and (current_type == "income" or looks_like_person_transfer_income):
        if threshold_amount <= Decimal("30"):
            return "income", "Tennis Smash & Social", None
        return "income", "Tennis Lessons", None

    for pattern, result in INCOME_RULES:
        if re.search(pattern, normalized, re.IGNORECASE):
            return result[0], result[1], None

    for pattern, category in EXPENSE_RULES:
        if re.search(pattern, normalized, re.IGNORECASE):
            tx_type = "expense"
            if "APPLE.COM/BILL" in normalized and amount_mxn == Decimal("399"):
                return tx_type, "Personal Dev", None
            if "APPLE.COM/BILL" in normalized and amount_mxn == Decimal("215"):
                return tx_type, "IG Ro Project", None
            return tx_type, category, None

    if current_type in {"income", "expense", "ignored"} and current_category:
        if current_category == "Bank Fee":
            return current_type, "Bills/Fees", None
        if current_category == "Transfer":
            return current_type, ("Tennis Lessons" if current_type == "income" else "Other"), None
        return current_type, current_category, None

    fallback_type = "expense"
    fallback_notes = "Unclassified expense — manual review needed"
    return fallback_type, "Other", fallback_notes

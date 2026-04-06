from __future__ import annotations

import re
from datetime import date, timedelta
from decimal import Decimal
from functools import lru_cache

import httpx


USD_URL = "https://www.banxico.org.mx/tipcamb/tipCamIHAction.do"
EURO_URL = "https://www.banxico.org.mx/tipcamb/otrasDivHistAction.do"
DATE_RE = r"(?P<date>\d{2}/\d{2}/\d{4})"
VALUE_RE = r"(?P<value>\d+\.\d+|N/E)"


def _format_banxico_date(value: date) -> str:
    return value.strftime("%d/%m/%Y")


def _parse_table_value(html: str, target_date: date) -> Decimal | None:
    formatted = _format_banxico_date(target_date)
    pattern = re.compile(
        rf"{re.escape(formatted)}.*?<td class=\"renglonPar\">\s*{VALUE_RE}\s*</td>",
        re.DOTALL,
    )
    match = pattern.search(html)
    if not match:
        return None
    value = match.group("value")
    if value == "N/E":
        return None
    return Decimal(value)


@lru_cache(maxsize=1024)
def _fetch_usd_rate(target_date: date) -> Decimal | None:
    response = httpx.post(
        USD_URL,
        data={
            "idioma": "sp",
            "fechaInicial": _format_banxico_date(target_date),
            "fechaFinal": _format_banxico_date(target_date),
            "salida": "HTML",
        },
        timeout=20.0,
        follow_redirects=True,
    )
    response.raise_for_status()
    html = response.text

    formatted = _format_banxico_date(target_date)
    start = html.find(formatted)
    if start < 0:
        return None
    snippet = html[start : start + 500]
    candidates = re.findall(r"<td class=\"renglonPar\">\s*(\d+\.\d+|N/E)\s*</td>", snippet)
    if len(candidates) < 3:
        return None
    para_pagos = candidates[-1]
    if para_pagos == "N/E":
        return None
    return Decimal(para_pagos)


@lru_cache(maxsize=1024)
def _fetch_eur_rate(target_date: date) -> Decimal | None:
    response = httpx.post(
        EURO_URL,
        data={
            "idioma": "sp",
            "fechaInicial": _format_banxico_date(target_date),
            "fechaFinal": _format_banxico_date(target_date),
            "salida": "HTML",
            "seriesSeleccionadas": "EURO",
        },
        timeout=20.0,
        follow_redirects=True,
    )
    response.raise_for_status()
    return _parse_table_value(response.text, target_date)


def get_banxico_rate(currency: str, target_date: date, lookback_days: int = 7) -> Decimal | None:
    normalized_currency = currency.upper()
    fetcher = None
    if normalized_currency == "USD":
        fetcher = _fetch_usd_rate
    elif normalized_currency == "EUR":
        fetcher = _fetch_eur_rate
    else:
        return None

    for offset in range(0, lookback_days + 1):
        candidate_date = target_date - timedelta(days=offset)
        rate = fetcher(candidate_date)
        if rate is not None:
            return rate
    return None

import base64
import json
import os
from collections.abc import Iterable
from io import BytesIO

from openai import OpenAI
from pdf2image import convert_from_bytes

from app.services.arq_parser import parse_arq_pdf
from app.services.banamex_parser import parse_banamex_pdf
from app.services.hsbc_parser import parse_hsbc_pdf
from app.services.rappi_parser import parse_rappi_pdf


EXTRACTION_PROMPT = """
Identify the bank name and statement period from the document.
Extract ONLY transaction rows and ignore cover pages, legal text, summaries, promos, tables unrelated to transactions, and amortization schedules.
For each transaction return:
- date in YYYY-MM-DD when inferable from statement context
- description raw text
- amount_original
- currency_original
- direction: in or out
- exchange_rate if shown
- local_mxn if shown as local equivalent / monto local equivalente
- category
- type
- notes

Apply the provided classification rules. Never invent transactions.

Important bank-specific instructions:
- Banamex credit-card statements contain sections like "CARGOS, ABONOS Y COMPRAS REGULARES (NO A MESES)" and installment sections like "COMPRAS Y CARGOS DIFERIDOS A MESES ...".
- For Banamex regular transactions, one transaction may span multiple lines:
  - line 1: operation date, posting date, merchant description, MXN amount
  - optional line 2+: embedded FX fields like `TC1*`, `TC2*`, then original currency and original amount
- For Banamex foreign transactions:
  - `Monto` is the final MXN amount
  - original currency and amount appear below the merchant row
  - compute `exchange_rate` as the effective MXN-per-original-currency rate
  - if both `TC1` and `TC2` are present and `TC2 > 0`, use `TC1 * TC2` as the basis for the effective rate
  - if `TC2` is `0.000000` for USD transactions, use `TC1`
- For Banamex payments like `PAGO INTERBANCARIO`, keep the full payment block together as one transaction row and classify it using the ignore rules.
- For Banamex `DIFERIMIENTO DE SALDO APP MOBILE`, extract it if visible but classify it as ignored.
- For Rappi installments use Mensualidad and include installment info in notes.

Output discipline:
- Extract only visible rows from transaction sections.
- Do not treat section totals or explanatory text as transactions.
- Return one JSON object for the whole chunk.
Return JSON ONLY in this exact shape:
{
  "bank_name": "string",
  "period_start": "YYYY-MM-DD or null",
  "period_end": "YYYY-MM-DD or null",
  "transactions": [
    {
      "date": "2026-01-15",
      "description": "UBER * EATS",
      "amount_original": 17.30,
      "currency_original": "EUR",
      "direction": "out",
      "exchange_rate": 18.2085,
      "local_mxn": 315.00,
      "category": "Food & Drink",
      "type": "expense",
      "notes": ""
    }
  ]
}
""".strip()


def _chunked(values: list[str], size: int) -> Iterable[list[str]]:
    for idx in range(0, len(values), size):
        yield values[idx : idx + size]


def pdf_to_base64_images(pdf_bytes: bytes) -> list[str]:
    # Use a lower DPI to avoid extremely tall statement pages tripping Pillow's
    # decompression-bomb guard during upload.
    pages = convert_from_bytes(pdf_bytes, fmt="jpeg", dpi=150)
    encoded_pages: list[str] = []
    for page in pages:
        buffer = BytesIO()
        page.save(buffer, format="JPEG", quality=90)
        encoded_pages.append(base64.b64encode(buffer.getvalue()).decode("utf-8"))
    return encoded_pages


def _merge_transactions(existing: list[dict], additions: list[dict]) -> list[dict]:
    merged = list(existing)
    seen = {
        (
            item.get("date"),
            (item.get("description") or "").strip().upper(),
            str(item.get("local_mxn") or item.get("amount_original") or ""),
        )
        for item in existing
    }
    for item in additions:
        key = (
            item.get("date"),
            (item.get("description") or "").strip().upper(),
            str(item.get("local_mxn") or item.get("amount_original") or ""),
        )
        if key in seen:
            continue
        merged.append(item)
        seen.add(key)
    return merged


def extract_transactions_from_pdf(pdf_bytes: bytes) -> dict:
    banamex_result = parse_banamex_pdf(pdf_bytes)
    if banamex_result and banamex_result.get("transactions"):
        return banamex_result

    arq_result = parse_arq_pdf(pdf_bytes)
    if arq_result and arq_result.get("transactions"):
        return arq_result

    hsbc_result = parse_hsbc_pdf(pdf_bytes)
    if hsbc_result and hsbc_result.get("transactions"):
        return hsbc_result

    rappi_result = parse_rappi_pdf(pdf_bytes)
    if rappi_result and rappi_result.get("transactions"):
        return rappi_result

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    images = pdf_to_base64_images(pdf_bytes)
    overall: dict = {"bank_name": "", "period_start": None, "period_end": None, "transactions": []}

    for index, image_group in enumerate(_chunked(images, 4)):
        message_content: list[dict] = []
        for encoded in image_group:
            message_content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{encoded}"},
                }
            )

        chunk_prompt = EXTRACTION_PROMPT
        if index > 0:
            chunk_prompt += (
                f"\nExisting bank_name: {overall['bank_name'] or 'unknown'}"
                f"\nExisting period_start: {overall['period_start']}"
                f"\nExisting period_end: {overall['period_end']}"
            )
        message_content.append({"type": "text", "text": chunk_prompt})

        response = client.chat.completions.create(
            model="gpt-4o",
            max_tokens=16000,
            messages=[{"role": "user", "content": message_content}],
            response_format={"type": "json_object"},
        )
        raw_content = response.choices[0].message.content or "{}"
        parsed = json.loads(raw_content)

        if not overall["bank_name"]:
            overall["bank_name"] = parsed.get("bank_name", "")
        if not overall["period_start"]:
            overall["period_start"] = parsed.get("period_start")
        if not overall["period_end"]:
            overall["period_end"] = parsed.get("period_end")
        overall["transactions"].extend(parsed.get("transactions", []))

    if rappi_result:
        overall["bank_name"] = rappi_result.get("bank_name", "") or overall["bank_name"]
        overall["period_start"] = overall["period_start"] or rappi_result.get("period_start")
        overall["period_end"] = overall["period_end"] or rappi_result.get("period_end")
        overall["transactions"] = _merge_transactions(overall["transactions"], rappi_result.get("transactions", []))

    return overall

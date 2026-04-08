from unittest import TestCase
from unittest.mock import patch

from app.services.rappi_parser import parse_rappi_pdf


class RappiParserTest(TestCase):
    def test_compras_a_meses_use_statement_end_date_and_mensualidad_amount(self) -> None:
        text = """
RAPPICARD
Periodo facturado 16 dic. 2025 - 15 ene. 2026
Compras a meses
Fecha Más detalle Monto original Pendiente Interés # de Mensualidad Mensualidad
2024-09-23 FUNDEDNEXT $ 23,422.78 $ 3,281.59 $ 150.31 16 de 18 $ 1,717.47
Subtotal $ 1,717.47
"""

        with patch("app.services.rappi_parser._extract_text", return_value=text):
            parsed = parse_rappi_pdf(b"fake")

        assert parsed is not None
        row = parsed["transactions"][0]
        self.assertEqual("2026-01-15", row["date"])
        self.assertEqual(1717.47, row["local_mxn"])
        self.assertEqual("Installment 16/18", row["notes"])

    def test_banorte_installments_ignore_page_headers_between_rows(self) -> None:
        text = """
RAPPICARD
Periodo 16-feb-2026 al 15-mar-2026
DESGLOSE DE MOVIMIENTOS
 COMPRAS Y CARGOS DIFERIDOS A MESES CON INTERESES
2026-02-09 AEROMEXICO WEB
PN; RFC:
AME880912I89
$2,310.00 $1,886.90 $113.83 $16.62 $330.95 2 de 9 64.92%
Número de contrato: 00190001000000033630
Página 4 de 10
Ver notas en la sección "NOTAS ACLARATORIAS" en este estado de cuenta.Notas:
Fecha de la
operación Descripción Monto
original
Saldo
pendiente
Intereses
2024-11-24 M.REPAIR - LISBOA $21,261.52 $1,161.92 $66.37 $9.32 $614.97 7 de 9 46.56%
 CARGOS, ABONOS Y COMPRAS REGULARES (NO A MESES)
"""

        with patch("app.services.rappi_parser._extract_text", return_value=text):
            parsed = parse_rappi_pdf(b"fake")

        assert parsed is not None
        self.assertEqual(2, len(parsed["transactions"]))
        self.assertEqual(
            {
                "date": "2026-03-15",
                "description": "AEROMEXICO WEB PN; RFC: AME880912I89",
                "amount_original": 330.95,
                "currency_original": "MXN",
                "direction": "out",
                "exchange_rate": 1.0,
                "local_mxn": 330.95,
                "category": "Other",
                "type": "expense",
                "notes": "Installment 2/9",
            },
            parsed["transactions"][0],
        )
        self.assertEqual("Installment 7/9", parsed["transactions"][1]["notes"])

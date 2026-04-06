from datetime import date
from decimal import Decimal
from unittest import TestCase
from unittest.mock import Mock, patch

from app.services.fx_rates import get_banxico_rate


class FxRatesTest(TestCase):
    @patch("app.services.fx_rates.httpx.post")
    def test_fetches_usd_para_pagos_rate(self, mock_post: Mock) -> None:
        mock_post.return_value = Mock(
            text="""
            <td class="renglonPar">28/01/2026</td>
            <td class="renglonPar">17.2322</td>
            <td class="renglonPar">17.2357</td>
            <td class="renglonPar">17.2830</td>
            """,
            raise_for_status=lambda: None,
        )

        rate = get_banxico_rate("USD", date(2026, 1, 28))
        self.assertEqual(Decimal("17.2830"), rate)

    @patch("app.services.fx_rates.httpx.post")
    def test_fetches_euro_rate(self, mock_post: Mock) -> None:
        mock_post.return_value = Mock(
            text="""
            <td class="renglonPar">28/01/2026</td>
            <td class="renglonPar">20.6252</td>
            """,
            raise_for_status=lambda: None,
        )

        rate = get_banxico_rate("EUR", date(2026, 1, 28))
        self.assertEqual(Decimal("20.6252"), rate)

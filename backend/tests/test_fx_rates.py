from datetime import date
from decimal import Decimal
from unittest import TestCase
from unittest.mock import Mock, patch

import httpx

from app.services.fx_rates import DISPLAY_RATE_FALLBACKS, get_banxico_rate, get_display_rates


class FxRatesTest(TestCase):
    def setUp(self) -> None:
        from app.services import fx_rates

        fx_rates._fetch_eur_rate.cache_clear()
        fx_rates._fetch_usd_rate.cache_clear()

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

    @patch("app.services.fx_rates.httpx.post")
    def test_display_rates_fall_back_when_banxico_request_fails(self, mock_post: Mock) -> None:
        request = httpx.Request("POST", "https://www.banxico.org.mx/tipcamb/otrasDivHistAction.do")
        response = httpx.Response(404, request=request)
        mock_post.return_value = Mock(
            raise_for_status=Mock(
                side_effect=httpx.HTTPStatusError("missing rate table", request=request, response=response)
            )
        )

        rates = get_display_rates(date(2026, 6, 13))

        self.assertEqual(Decimal("1"), rates["MXN"])
        self.assertEqual(DISPLAY_RATE_FALLBACKS["EUR"], rates["EUR"])
        self.assertEqual(DISPLAY_RATE_FALLBACKS["USD"], rates["USD"])

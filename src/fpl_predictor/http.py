from __future__ import annotations

import logging
import time

import requests

RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
logger = logging.getLogger(__name__)


def get_with_retries(
    session: requests.Session,
    url: str,
    *,
    headers: dict[str, str] | None = None,
) -> requests.Response:
    """Retry temporary download failures, with at most four requests per URL."""
    for attempt in range(4):
        try:
            response = session.get(url, timeout=30, headers=headers)
            response.raise_for_status()
            return response
        except (requests.ConnectionError, requests.Timeout, requests.HTTPError) as error:
            if isinstance(error, requests.HTTPError):
                if error.response is None or error.response.status_code not in RETRYABLE_STATUS_CODES:
                    raise
                error.response.close()
            if attempt == 3:
                raise
            delay = 2 ** attempt
            logger.warning("Download failed for %s; retrying in %ss: %s", url, delay, error)
            time.sleep(delay)
    raise AssertionError("Unreachable")

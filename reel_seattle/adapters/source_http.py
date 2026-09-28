"""Small HTTP helper for independent-source adapters.

Returns status codes instead of raising on HTTP errors so a 403/500 can become
``request_failure`` rather than an empty successful scrape.
"""

from __future__ import annotations

import urllib.error
import urllib.request

DEFAULT_USER_AGENT = "ReelSeattle/1.0 (showtimes ingestion)"
DEFAULT_TIMEOUT_SECONDS = 45


class SourceHttpError(OSError):
    """Connection failure before an HTTP status was available."""


def http_exchange(
    url: str,
    *,
    method: str = "GET",
    data: bytes | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> tuple[int, bytes, dict[str, str]]:
    """Return ``(status, body, lowercase headers)``.

    ``urllib.error.HTTPError`` is returned as a status. Transport failures raise
    ``SourceHttpError``.
    """
    merged = {"User-Agent": DEFAULT_USER_AGENT, "Accept": "*/*"}
    if headers:
        merged.update(headers)
    request = urllib.request.Request(url, data=data, headers=merged, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = response.read()
            hdrs = {key.lower(): value for key, value in response.headers.items()}
            return int(response.status), payload, hdrs
    except urllib.error.HTTPError as exc:
        body = exc.read()
        hdrs = {key.lower(): value for key, value in exc.headers.items()} if exc.headers else {}
        return int(exc.code), body, hdrs
    except urllib.error.URLError as exc:
        raise SourceHttpError(str(exc.reason)) from exc

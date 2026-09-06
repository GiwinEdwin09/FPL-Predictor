from unittest.mock import Mock

import pytest
import requests

from fpl_predictor.http import get_with_retries


def response(status: int = 200, content: bytes = b"ok") -> requests.Response:
    result = requests.Response()
    result.status_code = status
    result.url = "https://example.com/data.csv"
    result._content = content
    result._content_consumed = True
    return result


def test_retries_temporary_errors_then_returns_success(monkeypatch) -> None:
    sleep = Mock()
    monkeypatch.setattr("fpl_predictor.http.time.sleep", sleep)
    session = Mock()
    session.get.side_effect = [response(503), requests.Timeout(), response()]

    assert get_with_retries(session, "https://example.com/data.csv").content == b"ok"
    assert session.get.call_count == 3
    assert [call.args[0] for call in sleep.call_args_list] == [1, 2]


@pytest.mark.parametrize("status, attempts", [(503, 4), (404, 1), (403, 1)])
def test_download_failure_remains_fatal_and_retries_are_bounded(monkeypatch, status, attempts) -> None:
    monkeypatch.setattr("fpl_predictor.http.time.sleep", Mock())
    session = Mock()
    session.get.side_effect = [response(status) for _ in range(attempts)]

    with pytest.raises(requests.HTTPError):
        get_with_retries(session, "https://example.com/data.csv")
    assert session.get.call_count == attempts

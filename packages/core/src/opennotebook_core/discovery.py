"""Search providers and a conservative DuckDuckGo HTML adapter."""

from typing import Protocol
from urllib.parse import parse_qs, quote_plus, unquote, urlsplit

from bs4 import BeautifulSoup

from opennotebook_core.safe_fetch import UnsafeURL, fetch_public_url, validate_url


class SearchCandidate:
    def __init__(self, title: str, url: str, snippet: str) -> None:
        self.title = title
        self.url = url
        self.snippet = snippet


class SearchProvider(Protocol):
    async def search(self, query: str, limit: int = 8) -> list[SearchCandidate]: ...


class DuckDuckGoSearch:
    async def search(self, query: str, limit: int = 8) -> list[SearchCandidate]:
        if not query.strip() or not 1 <= limit <= 10:
            raise ValueError("Search needs a query and limit between 1 and 10")
        html = await fetch_public_url(
            f"https://html.duckduckgo.com/html/?q={quote_plus(query[:300])}",
            max_bytes=2_000_000,
        )
        soup = BeautifulSoup(html, "html.parser")
        results: list[SearchCandidate] = []
        for item in soup.select(".result"):
            link = item.select_one("a.result__a")
            if link is None:
                continue
            href = str(link.get("href") or "")
            parsed = urlsplit(href)
            if parsed.hostname and parsed.hostname.endswith("duckduckgo.com"):
                href = parse_qs(parsed.query).get("uddg", [""])[0]
            href = unquote(href)
            try:
                validate_url(href)
            except (UnsafeURL, ValueError):
                continue
            snippet = item.select_one(".result__snippet")
            results.append(
                SearchCandidate(
                    title=link.get_text(" ", strip=True)[:300],
                    url=href[:2048],
                    snippet=snippet.get_text(" ", strip=True)[:1000] if snippet else "",
                )
            )
            if len(results) >= limit:
                break
        return results

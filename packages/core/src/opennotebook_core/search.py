from typing import Protocol


class SearchProvider(Protocol):
    async def search(self, query: str, limit: int = 10) -> list[str]: ...

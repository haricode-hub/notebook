from opennotebook_embed.main import EmbeddingCache


def test_embedding_cache_is_bounded_and_returns_copies() -> None:
    cache = EmbeddingCache(1)
    first = ("query", 768, "first")
    second = ("document", 768, "first")
    cache.put(first, [1.0, 0.0])
    vector = cache.get(first)
    assert vector == [1.0, 0.0]
    assert vector is not None
    vector[0] = 0.0
    assert cache.get(first) == [1.0, 0.0]
    cache.put(second, [0.0, 1.0])
    assert cache.get(first) is None
    assert cache.get(second) == [0.0, 1.0]


def test_embedding_cache_disabled_at_zero_capacity() -> None:
    cache = EmbeddingCache(0)
    cache.put(("query", 128, "text"), [1.0])
    assert cache.values == {}

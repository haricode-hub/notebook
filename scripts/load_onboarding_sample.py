"""Create a ready-to-use observatory notebook for an authenticated user."""

import argparse
import os
import time
from pathlib import Path

import httpx


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--token", default=os.getenv("SAMPLE_USER_TOKEN"))
    args = parser.parse_args()
    if not args.token:
        parser.error("Pass --token or set SAMPLE_USER_TOKEN to a Better Auth API JWT")

    api = os.getenv("API_URL", "http://localhost:8000").rstrip("/")
    headers = {"Authorization": f"Bearer {args.token}"}
    with httpx.Client(base_url=api, headers=headers, timeout=30) as client:
        notebook = client.post(
            "/notebooks", json={"title": "Sample: Observatory field notes"}
        )
        notebook.raise_for_status()
        notebook_id = notebook.json()["id"]
        text = Path("docs/samples/observatory-notebook.md").read_text(encoding="utf-8")
        source = client.post(
            f"/notebooks/{notebook_id}/sources/text",
            json={"name": "Observatory field notes.md", "text": text},
        )
        source.raise_for_status()
        source_id = source.json()["id"]
        for _ in range(120):
            rows = client.get(f"/notebooks/{notebook_id}/sources").json()
            match = next(row for row in rows if row["id"] == source_id)
            if match["status"] == "ready":
                print(f"Sample notebook is ready: {api}/notebooks/{notebook_id}")
                return
            if match["status"] == "failed":
                raise RuntimeError(f"Sample source ingestion failed: {match['error']}")
            time.sleep(1)
        raise TimeoutError(f"Sample source did not become ready: {notebook_id}")


if __name__ == "__main__":
    main()

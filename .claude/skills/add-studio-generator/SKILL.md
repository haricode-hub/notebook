---
name: add-studio-generator
description: Add a cited Studio generation recipe using the Level 6 artifact framework.
---

# Add a Studio generator

Read `AGENTS.md`, the active level file, and ADR-009 before editing. Keep new recipes grounded and versioned.

1. Define the recipe ID, title, and instruction in `packages/core/src/opennotebook_core/prompts/artifact_v1.py` or create a new versioned prompt module if the output contract changes. The `ArtifactRecipe` registry in `packages/core/src/opennotebook_core/artifacts.py` picks up a conventional recipe automatically. Override its Pydantic `output_schema` and `renderer_id` only when needed; common text recipes use `ArtifactDocument` and `markdown_sections_v1` without a route branch.
2. If a recipe needs a different schema, add its Pydantic model and validation in the generator. Validate every `[S#]` against the exact chunk labels sent to the model. Retain the single repair retry and failed job state. Keep source text untrusted.
3. For a new media type, add a small route branch in `apps/api/src/opennotebook_api/routers/artifacts.py` that dispatches to the recipe renderer. Keep ownership checks before reading or exporting. Text recipes use the generic create/list/get/regenerate/delete routes without a branch.
4. Add a renderer in `apps/web/src/components/artifact-studio.tsx` for the new `renderer_id`. Reuse `CitedMarkdown` and its citation callback so chips open the source viewer. Add the Studio tile label and any recipe-specific options.
5. Add fixture tests for valid output, malformed JSON then one repair, invalid citation rejection, source selection, ownership, export opening, and a browser journey from tile to citation. Run `make lint && make typecheck && make test`, regenerate OpenAPI types with `make types`, then run the relevant Playwright journey.

For a conventional text recipe, the backend change is normally one prompt/registry tuple and one fixture case, well under 60 new lines.

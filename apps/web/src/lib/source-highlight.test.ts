import { describe, expect, it } from "vitest";
import { matchingPdfItems } from "./source-highlight";

describe("matchingPdfItems", () => {
  it("matches an exact quote split across PDF text items", () => {
    expect([...matchingPdfItems(["The evidence", " supports this claim."], "The evidence supports this claim.")]).toEqual([0, 1]);
  });

  it("highlights the first citation anchor when the quote continues onto another page", () => {
    const quote = `${"The first page contains this important passage. ".repeat(3)}${"Continuation on the next page. ".repeat(5)}`;
    const pageText = `${"Preface text. ".repeat(4)}${quote.slice(0, 100)}`;
    expect([...matchingPdfItems([pageText], quote)]).toEqual([0]);
  });

  it("highlights a last anchor when the cited page only contains the quote ending", () => {
    const quote = `${"The first page contains this important passage. ".repeat(3)}${"Continuation on the next page. ".repeat(5)}`;
    expect([...matchingPdfItems([quote.slice(-160)], quote)]).toEqual([0]);
  });

  it("returns no match when neither fuzzy anchor appears", () => {
    expect([...matchingPdfItems(["Different content"], "The cited passage is missing from this page entirely.")]).toEqual([]);
  });
});

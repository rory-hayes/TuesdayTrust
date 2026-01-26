import { describe, expect, it } from "vitest"
import { detectResponseType, normalizeText } from "../src/processors/normalize"


describe("normalize", () => {
  it("normalizes whitespace", () => {
    expect(normalizeText("Hello   world\n")).toBe("Hello world")
  })

  it("detects response types", () => {
    expect(detectResponseType("Yes/No: Do you encrypt data?")).toBe("yesno")
    expect(detectResponseType("How many servers are in scope?")).toBe("numeric")
    expect(detectResponseType("What date was this updated?")).toBe("date")
    expect(detectResponseType("Describe your controls.")).toBe("free_text")
  })
})

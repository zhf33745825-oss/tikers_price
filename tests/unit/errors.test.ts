import { describe, expect, it } from "vitest";

import {
  normalizeUpstreamErrorMessage,
  normalizeYahooErrorMessage,
} from "@/lib/stock/errors";

describe("normalizeYahooErrorMessage", () => {
  it("maps html payload to concise yahoo unavailable message", () => {
    const htmlError = new Error(
      "<html><body><script>alert('x')</script><p>Yahoo blocked region</p></body></html>",
    );
    const message = normalizeYahooErrorMessage(htmlError);

    expect(message).toContain("Yahoo source unavailable");
    expect(message).not.toContain("<html>");
    expect(message).not.toContain("<script>");
  });

  it("truncates overly long error message", () => {
    const longError = new Error("timeout ".repeat(80));
    const message = normalizeUpstreamErrorMessage(longError, {
      fallbackMessage: "fallback",
      maxLength: 80,
    });

    expect(message.length).toBeLessThanOrEqual(80);
    expect(message.endsWith("...")).toBe(true);
  });

  it("keeps plain text error as-is", () => {
    const message = normalizeYahooErrorMessage(new Error("ECONNRESET while calling Yahoo API"));
    expect(message).toBe("ECONNRESET while calling Yahoo API");
  });
});

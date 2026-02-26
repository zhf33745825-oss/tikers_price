import { describe, expect, it } from "vitest";

import {
  isPrismaKnownRequestError,
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

describe("isPrismaKnownRequestError", () => {
  it("matches by prisma error name and code", () => {
    const error = {
      name: "PrismaClientKnownRequestError",
      code: "P2025",
    };

    expect(isPrismaKnownRequestError(error, "P2025")).toBe(true);
    expect(isPrismaKnownRequestError(error, "P2002")).toBe(false);
  });

  it("matches code pattern fallback", () => {
    expect(isPrismaKnownRequestError({ code: "P2002" })).toBe(true);
    expect(isPrismaKnownRequestError({ code: "X0000" })).toBe(false);
  });
});

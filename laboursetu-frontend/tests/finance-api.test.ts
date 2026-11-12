import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { financialRequest, downloadFinance } from "../src/lib/finance-api";

beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => "test-token" });
});
afterEach(() => vi.unstubAllGlobals());
describe("Financial API client", () => {
  it("preserves exact decimal strings and the supplied retry key", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ data: { amount: "0.30", status: "PENDING" } }),
      });
    vi.stubGlobal("fetch", fetch);
    const result = await financialRequest(
      "/payments",
      { amount: "0.30" },
      "retry-key-123",
    );
    expect(result).toEqual({ amount: "0.30", status: "PENDING" });
    expect(fetch.mock.calls[0][1]).toMatchObject({
      credentials: "include",
      body: '{"amount":"0.30"}',
      headers: {
        "Idempotency-Key": "retry-key-123",
        Authorization: "Bearer test-token",
      },
    });
  });
  it("surfaces backend validation and does not infer payment success", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          status: 400,
          json: async () => ({
            error: {
              code: "VALIDATION_ERROR",
              message: "Validation failed",
              details: [{ field: "amount", message: "Must be positive" }],
            },
          }),
        }),
    );
    await expect(
      financialRequest("/payments", { amount: "-1" }, "retry-key-123"),
    ).rejects.toThrow("amount: Must be positive");
  });
  it("sends explicit manual confirmation only when requested", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ data: { confirmation: "MANUALLY_CONFIRMED" } }),
      });
    vi.stubGlobal("fetch", fetch);
    await financialRequest(
      "/payments/id/confirm",
      { manuallyConfirmed: true },
      "confirmation-key",
    );
    expect(fetch.mock.calls[0][1].body).toBe('{"manuallyConfirmed":true}');
  });
  it("rejects unauthorized report downloads before creating a file", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          json: async () => ({
            error: { message: "Financial access is not permitted" },
          }),
        }),
    );
    await expect(
      downloadFinance("/reports/site-cost?format=pdf", "report.pdf"),
    ).rejects.toThrow("not permitted");
  });
});

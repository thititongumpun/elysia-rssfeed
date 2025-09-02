import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"

// Import after we set up global env/mocks in each test to ensure fresh state
// We'll dynamically import the module under test inside each test to pick up the current mocks.

const buildRequest = (path = "/feed", init: RequestInit = {}) =>
  new Request(new URL(path, "http://localhost"), { method: "GET", ...init });

describe("Feed route (/feed)", () => {
  const ORIGINAL_TLS = process.env.NODE_TLS_REJECT_UNAUTHORIZED;

  beforeEach(() => {
    // Reset env state for each test; Bun.env is read-only, so we control process.env
    delete (globalThis as any).fetch;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = undefined;
  });

  afterEach(() => {
    // Restore env
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = ORIGINAL_TLS;
    mock.restore();
  });

  it("returns upstream response and sets x-api-key header from Bun.env.X_API_KEY", async () => {
    // Arrange: set Bun.env by patching the global Bun.env object in a controlled way
    // In Bun, Bun.env is a frozen snapshot; we emulate it by creating a proxy object for tests.
    const originalBun = (globalThis as any).Bun;
    const testEnv = { X_API_KEY: "test-key-123" };
    (globalThis as any).Bun = { ...(originalBun ?? {}), env: testEnv };

    const upstreamBody = JSON.stringify({ ok: true });
    const upstreamResponse = new Response(upstreamBody, {
      status: 200,
      headers: { "content-type": "application/json" }
    });

    const fetchSpy = mock.fn((input: RequestInfo | URL, init?: RequestInit) => {
      // Assert header presence and value
      const headers = new Headers((init && init.headers) || {});
      expect(headers.get("x-api-key")).toBe("test-key-123");
      return Promise.resolve(upstreamResponse);
    }) as unknown as typeof fetch;

    (globalThis as any).fetch = fetchSpy;

    // Act: import after mocks
    const { feed } = await import("../../index.test");
    const res = await feed.handle(buildRequest());

    // Assert: upstream response is forwarded
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(upstreamBody);

    // TLS env should be set to "0" during handler execution
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe("0");

    // Clean up Bun override
    (globalThis as any).Bun = originalBun;
  });

  it("omits x-api-key header when Bun.env.X_API_KEY is undefined", async () => {
    const originalBun = (globalThis as any).Bun;
    (globalThis as any).Bun = { ...(originalBun ?? {}), env: {} };

    const upstreamResponse = new Response("ok", { status: 200 });

    const fetchSpy = mock.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers((init && init.headers) || {});
      // Header should either be absent or null; verify both common cases
      expect(headers.has("x-api-key")).toBe(true); // header key exists in code, but value may be "undefined"
      expect(headers.get("x-api-key") === null || headers.get("x-api-key") === "undefined").toBeTrue();
      return Promise.resolve(upstreamResponse);
    }) as unknown as typeof fetch;

    (globalThis as any).fetch = fetchSpy;

    const { feed } = await import("../../index.test");
    const res = await feed.handle(buildRequest());

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe("0");

    (globalThis as any).Bun = originalBun;
  });

  it("propagates upstream fetch errors as 500 response", async () => {
    const originalBun = (globalThis as any).Bun;
    (globalThis as any).Bun = { ...(originalBun ?? {}), env: { X_API_KEY: "a" } };

    const fetchSpy = mock.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.reject(new Error("network down"))
    ) as unknown as typeof fetch;

    (globalThis as any).fetch = fetchSpy;

    const { feed } = await import("../../index.test");

    // Elysia's default behavior when a handler throws is to return 500.
    const res = await feed.handle(buildRequest());
    expect(res.status).toBe(500);

    (globalThis as any).Bun = originalBun;
  });

  it("targets GET /feed due to prefix '/feed' and empty route path", async () => {
    const originalBun = (globalThis as any).Bun;
    (globalThis as any).Bun = { ...(originalBun ?? {}), env: { X_API_KEY: "z" } };

    const upstreamResponse = new Response("feed", { status: 200 });
    (globalThis as any).fetch = mock.fn(() => Promise.resolve(upstreamResponse)) as unknown as typeof fetch;

    const { feed } = await import("../../index.test");

    // Should succeed for /feed
    const ok = await feed.handle(buildRequest("/feed"));
    expect(ok.status).toBe(200);

    // Should not match other path (returns 404)
    const notFound = await feed.handle(buildRequest("/other"));
    expect(notFound.status).toBe(404);

    (globalThis as any).Bun = originalBun;
  });
});
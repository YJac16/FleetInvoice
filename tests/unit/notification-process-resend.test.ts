import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/supabase/admin", () => {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    lte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    update: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.lte.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockImplementation(async () => ({ data: state.rows, error: null }));
  chain.update.mockImplementation((payload: Record<string, unknown>) => {
    state.updates.push(payload);
    return { eq: vi.fn(async () => ({ error: null })) };
  });

  return {
    createServiceClient: () => ({
      from: () => chain,
    }),
  };
});

const fetchMock = vi.fn();
const envBackup = { ...process.env };

function applyEnv(overrides: {
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
}) {
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NOTIFICATIONS_PROCESS_SECRET;
  process.env.CRON_SECRET = "cron-secret-value";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  if (overrides.RESEND_API_KEY !== undefined) {
    process.env.RESEND_API_KEY = overrides.RESEND_API_KEY;
  }
  if (overrides.RESEND_FROM_EMAIL !== undefined) {
    process.env.RESEND_FROM_EMAIL = overrides.RESEND_FROM_EMAIL;
  }
}

async function postProcess() {
  const { POST } = await import("@/app/api/notifications/process/route");
  return POST(
    new Request("http://localhost/api/notifications/process", {
      method: "POST",
      headers: { Authorization: "Bearer cron-secret-value" },
    })
  );
}

function pendingEmail(subject: string | null = null) {
  state.rows = [
    {
      id: "row-1",
      channel: "email",
      recipient: "invitee@example.com",
      subject,
      body: "Accept your invitation",
      attempts: 0,
    },
  ];
}

describe("notification process Resend from address", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    state.rows = [];
    state.updates = [];
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.unstubAllGlobals();
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["whitespace", "   "],
  ] as const)(
    "skips email rows when RESEND_API_KEY is %s",
    async (_label, apiKey) => {
      applyEnv({ RESEND_API_KEY: apiKey, RESEND_FROM_EMAIL: "" });
      pendingEmail();

      const response = await postProcess();
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.results).toEqual([{ id: "row-1", status: "skipped" }]);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(state.updates).toContainEqual(
        expect.objectContaining({
          status: "skipped",
          last_error:
            "RESEND_API_KEY not configured; invite URL still valid in app",
        })
      );
    }
  );

  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["whitespace", " \n "],
  ] as const)(
    "sends from GoOps when RESEND_FROM_EMAIL is %s",
    async (_label, fromEmail) => {
      applyEnv({
        RESEND_API_KEY: "re_test_key",
        RESEND_FROM_EMAIL: fromEmail,
      });
      pendingEmail(null);

      const response = await postProcess();
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.results).toEqual([{ id: "row-1", status: "sent" }]);
      expect(fetchMock).toHaveBeenCalledOnce();
      const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(String(request.body));
      expect(body.from).toBe("GoOps <hello@goops.co.za>");
      expect(body.subject).toBe("GoOps notification");
      expect(body.to).toEqual(["invitee@example.com"]);
      expect(request.headers).toMatchObject({
        Authorization: "Bearer re_test_key",
      });
    }
  );

  it("sends the configured RESEND_FROM_EMAIL when it is set", async () => {
    applyEnv({
      RESEND_API_KEY: "re_test_key",
      RESEND_FROM_EMAIL: "  Ops <ops@example.com>  ",
    });
    pendingEmail("  Shift reminder  ");

    const response = await postProcess();
    expect(response.status).toBe(200);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.from).toBe("Ops <ops@example.com>");
    expect(body.subject).toBe("Shift reminder");
  });
});

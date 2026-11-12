// Fixture sign-in for the watchtower dashboard. Runs before the app's code.
// The Supabase client (apps/watchtower/src/lib/supabase.ts) uses the default
// storage key for http://127.0.0.1:54321, which is sb-127-auth-token.
try {
  localStorage.setItem(
    "sb-127-auth-token",
    JSON.stringify({
      access_token: "local-fixture-token",
      token_type: "bearer",
      expires_in: 360000,
      expires_at: 4102444800,
      refresh_token: "local-fixture-refresh",
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        aud: "authenticated",
        role: "authenticated",
        email: "owner@example.test",
        app_metadata: {},
        user_metadata: { name: "Owner" },
        created_at: "2026-01-01T00:00:00Z",
      },
    }),
  );
} catch (error) {
  console.error("[fixture] could not write the session", error);
}

// The fixture's checks are dated 2026-11-10T06:41:12.000Z; hold the page clock five minutes after the newest one
// so the dashboard draws them as fresh, not Stale.
{
  const fixed = new Date("2026-11-10T06:41:12.000Z").getTime() + 5 * 60 * 1000
  const RealDate = Date
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length === 0 ? [fixed] : args))
    }
    static now() {
      return fixed
    }
  }
}

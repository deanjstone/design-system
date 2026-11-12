// Seeds a signed-in Supabase session for the shell fixture screens. The shell
// client uses the default storage key, which supabase-js derives from the
// project host: 127.0.0.1 gives `sb-127-auth-token`. No custom storageKey is set
// in apps/shell/src/lib/supabase.ts.
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
      last_sign_in_at: "2026-11-10T07:12:00Z",
    },
  }),
);

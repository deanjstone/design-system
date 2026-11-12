// Signs the fixture owner in before the app starts: App.tsx gates every signed-in
// route on supabase.auth.getSession(), which reads the default supabase-js storage
// key for the project ref "127" (VITE_SUPABASE_URL is http://127.0.0.1:54321 and
// lib/supabase.ts sets no custom storageKey). expires_at is far in the future, so
// the client never refreshes the token.
try {
  localStorage.setItem("sb-127-auth-token", JSON.stringify({
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
  }));
} catch (error) {
  console.error("knowledge fixture: could not store the fixture session", error);
}

// Pandora Lunar share profiles: admin Edge Function, version 2.
// Status: DEPLOYED to the Lunar project (ref dehuwlbcfejuiijbpaao),
// verify_jwt on. Version 1 had a re-key action; version 2 removed it.
//
// Only Haven uses this function. Each call is a Supabase write. When Claude
// makes the call, it needs Haven's two yes answers first (PRIORITY ONE).
//
// Actions (POST, JSON body, field "action"):
//   "rename"  Give a live share a custom code (1 to 8 letters and digits)
//             and make it permanent. The old code stays as an alias.
//             SQL: rename_share, one transaction.
// There is NO re-key action (Haven, 19 Nov 2026): the admin must not be able
// to take over a code. A player who loses the owner key and every recovery
// code makes a new share with a new code.
//
// Authentication: header "x-admin-token" must equal the ADMIN_TOKEN secret.
// The normal "Authorization: Bearer <anon key>" header is also required,
// because Supabase checks a JWT before the function runs.
//
// Environment:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (Supabase sets these)
//   ADMIN_TOKEN       secret, 40+ random characters (a Supabase secret: two yes answers)
//   ALLOWED_ORIGINS   comma-separated; the admin page origin, if one is made
//
// Example (Haven runs this; the values are placeholders):
//   curl -X POST https://<project>.supabase.co/functions/v1/share-admin \
//     -H "Authorization: Bearer <anon key>" -H "x-admin-token: <ADMIN_TOKEN>" \
//     -H "Content-Type: application/json" \
//     -d '{"action":"rename","code":"K7Q2-M9XP","newCode":"NCC1701D"}'

import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

interface RenameRequest {
  action: "rename";
  code: string;     // current code or an alias
  newCode: string;  // custom code; case and dashes are ignored
}

// Status word from rename_share -> HTTP status and message.
const RENAME_RESULTS: Record<string, [number, string]> = {
  ok:        [200, "renamed"],
  invalid:   [400, "the new code must be 1 to 8 letters and digits"],
  not_found: [404, "no share has that code"],
  expired:   [410, "that share has expired"],
  same:      [409, "the share already has that code"],
  taken:     [409, "the new code is already in use or reserved"],
};

function normalizeCode(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function displayCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function corsHeaders(origin: string | null): HeadersInit {
  const allow = origin && allowedOrigins.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-admin-token",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

async function handleRename(body: RenameRequest, origin: string | null): Promise<Response> {
  if (!body.code || !body.newCode) return json({ error: "code and newCode are required" }, 400, origin);

  const { data: status, error } = await db.rpc("rename_share", {
    p_code: body.code,
    p_new_code: body.newCode,
  });
  if (error) {
    console.error(error);
    return json({ error: "rename failed" }, 500, origin);
  }

  const [httpStatus, message] = RENAME_RESULTS[status as string] ?? [500, "unknown result"];
  if (status !== "ok") return json({ error: message, status }, httpStatus, origin);

  const newCode = normalizeCode(body.newCode);
  return json({
    status,
    code: newCode,
    display: displayCode(newCode),
    isPermanent: true,
  }, 200, origin);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "use POST" }, 405, origin);

  const expected = Deno.env.get("ADMIN_TOKEN") ?? "";
  const given = req.headers.get("x-admin-token") ?? "";
  // An empty ADMIN_TOKEN means the function is not configured: refuse all calls.
  if (expected.length < 40 || !constantTimeEqual(given, expected)) {
    return json({ error: "not authorized" }, 401, origin);
  }

  let body: RenameRequest;
  try { body = await req.json(); } catch { return json({ error: "body is not valid JSON" }, 400, origin); }

  if (body.action === "rename") return handleRename(body, origin);
  return json({ error: "unknown action" }, 400, origin);
});

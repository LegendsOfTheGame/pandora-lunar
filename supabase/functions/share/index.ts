// Pandora Lunar share profiles: upload Edge Function, draft 1.
// Status: DEPLOYED as version 1 to the Lunar project (ref dehuwlbcfejuiijbpaao)
// on 19 Nov 2026 (UTC), verify_jwt on. The deployed copy still has the old
// "DRAFT" header line; the code is the same.
//
// Actions (POST, JSON body, field "action"):
//   "upload"  Make a new share, or update a live share that this browser owns.
//   "delete"  Delete a share that this browser owns.
//   "unlock"  Restore, step 1. Proof is the owner key OR one recovery code.
//             Returns the encrypted backup and the matching wrapped data key.
//             Does not spend the recovery code and changes nothing.
//   "claim"   Restore, step 2, recovery code only. The new browser sends a new
//             owner key and the data key wrapped with it. One transaction
//             (claim_recovery in SQL) spends the code and replaces the owner
//             key. The OLD owner key then stops working.
//             Restore with the owner key needs no claim: the browser keeps
//             that key.
//   "recovery-set"  Replace all recovery codes with a new set of 5.
//             Proof is the owner key. One transaction (replace_recovery_codes
//             in SQL) deletes the old codes, used and unused, and stores the
//             new set. The browser makes the codes and wraps the data key
//             with each one; it sends hashes and wrapped keys only.
// Admin actions (rename) are in ../share-admin/index.ts.
// After a rename, "upload" with the old code still works: findShare follows
// the alias, and the response gives the browser the new code.
//
// Recovery code format: 16 characters from CODE_ALPHABET, shown as
// XXXX-XXXX-XXXX-XXXX. Its hash is SHA-256 (hex) of the code in upper case
// with no dashes, UTF-8. The browser uses the same rule when it sends
// recoveryCodes[].codeHash on the first share.
//
// Rules from the design:
//   * A live code + the correct owner key: update that share. The expiry moves
//     to now + 48 h (permanent shares have no expiry).
//   * An expired code, an unknown code, no owner key or a wrong owner key:
//     make a NEW share with a new code. The response does not say which case.
//   * "Keep this code permanently" is accepted on the first share only.
//   * The server never sees the backup in plain form, and never stores the
//     owner key. The client sends recovery codes as SHA-256 hashes only.
//
// Environment:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (Supabase sets these)
//   RATE_LIMIT_SALT   secret, 32+ random characters  (a Supabase secret: two yes answers)
//   ALLOWED_ORIGINS   comma-separated, for example
//                     "https://legendmemoria.org,http://localhost:8778"

import { createClient } from "jsr:@supabase/supabase-js@2";

// Limits ---------------------------------------------------------------------
// Keep these equal to the CHECK limits in 0001_share_profiles.sql.
const SHARE_LIFETIME_MS = 48 * 60 * 60 * 1000;
const MAX_PROGRESS_BYTES = 262_144;
const MAX_BACKUP_BYTES = 4_194_304;
const MAX_BODY_BYTES = 6_000_000; // base64 of a full backup + progress
const RECOVERY_CODE_COUNT = 5;
const UPLOADS_PER_HOUR = 12;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

// 32 characters, no O, 0, I, 1. 256 is a multiple of 32, so byte % 32 has no bias.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

// Types ------------------------------------------------------------------------

interface UploadRequest {
  action: "upload";
  code?: string;        // the code this browser holds, if any
  ownerKey?: string;    // base64url, 32 bytes; required with code
  newOwnerKey?: string; // base64url, 32 bytes; used when a new share is made
  keepPermanent?: boolean;
  progress: Record<string, unknown>;
  dataAsOf: string;     // ISO 8601
  backup: { ciphertext: string; iv: string; ownerWrappedDek: string }; // base64
  recoveryCodes?: { codeHash: string; wrappedDek: string }[];          // hex, base64
}

interface DeleteRequest {
  action: "delete";
  code: string;
  ownerKey: string;
}

interface UnlockRequest {
  action: "unlock";
  code: string;
  ownerKey?: string;     // give this OR recoveryCode
  recoveryCode?: string;
}

interface ClaimRequest {
  action: "claim";
  code: string;
  recoveryCode: string;
  newOwnerKey: string;          // base64url, 32 bytes
  newOwnerWrappedDek: string;   // base64
}

interface RecoverySetRequest {
  action: "recovery-set";
  code: string;
  ownerKey: string;
  recoveryCodes: { codeHash: string; wrappedDek: string }[]; // hex, base64
}

type AnyRequest = UploadRequest | DeleteRequest | UnlockRequest | ClaimRequest | RecoverySetRequest;

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Helpers ----------------------------------------------------------------------

function normalizeCode(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function displayCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

function fromBase64(s: string, field: string): Uint8Array {
  try {
    const std = s.replace(/-/g, "+").replace(/_/g, "/");
    const padded = std + "=".repeat((4 - (std.length % 4)) % 4);
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  } catch {
    throw new HttpError(400, `${field} is not valid base64`);
  }
}

// PostgREST accepts bytea as a "\x<hex>" string.
function toByteaHex(bytes: Uint8Array): string {
  return "\\x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// PostgREST returns bytea as a "\x<hex>" string. Converts it to base64.
function byteaHexToBase64(hex: string): string {
  const h = hex.startsWith("\\x") ? hex.slice(2) : hex;
  let bin = "";
  for (let i = 0; i < h.length; i += 2) bin += String.fromCharCode(parseInt(h.slice(i, i + 2), 16));
  return btoa(bin);
}

async function recoveryCodeHash(raw: string): Promise<string> {
  const c = normalizeCode(raw);
  if (c.length !== 16 || [...c].some((ch) => !CODE_ALPHABET.includes(ch))) {
    throw new HttpError(400, "recovery code must be 16 characters");
  }
  return sha256Hex(c);
}

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const input = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function ownerKeyHash(ownerKey: string, field: string): Promise<string> {
  const bytes = fromBase64(ownerKey, field);
  if (bytes.length !== 32) throw new HttpError(400, `${field} must be 32 bytes`);
  return sha256Hex(bytes);
}

function corsHeaders(origin: string | null): HeadersInit {
  const allow = origin && allowedOrigins.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

// Rate limit -------------------------------------------------------------------
// Counts requests of all actions from one client in the last hour. The client is a
// salted hash of the first x-forwarded-for address; the address is not stored.

async function checkRateLimit(req: Request): Promise<void> {
  const salt = Deno.env.get("RATE_LIMIT_SALT");
  if (!salt) throw new HttpError(500, "server is not configured");
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const clientHash = await sha256Hex(salt + ip);
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error } = await db.from("share_upload_log")
    .select("id", { count: "exact", head: true })
    .eq("client_hash", clientHash).gte("at", since);
  if (error) throw new HttpError(500, "rate limit check failed");
  if ((count ?? 0) >= UPLOADS_PER_HOUR) throw new HttpError(429, "too many uploads, try again later");

  await db.from("share_upload_log").insert({ client_hash: clientHash });
}

// Lookup -----------------------------------------------------------------------
// Finds a share by its code or by an alias. Returns null if not found.

async function findShare(code: string) {
  const c = normalizeCode(code);
  if (!/^[A-Z0-9]{1,8}$/.test(c)) return null;

  let { data } = await db.from("shares")
    .select("id, code, owner_key_hash, is_permanent, expires_at")
    .eq("code", c).maybeSingle();
  if (!data) {
    const { data: alias } = await db.from("share_aliases")
      .select("share_id").eq("alias", c).maybeSingle();
    if (!alias) return null;
    ({ data } = await db.from("shares")
      .select("id, code, owner_key_hash, is_permanent, expires_at")
      .eq("id", alias.share_id).maybeSingle());
  }
  return data;
}

function isLive(share: { is_permanent: boolean; expires_at: string | null }): boolean {
  return share.is_permanent || (share.expires_at !== null && new Date(share.expires_at).getTime() > Date.now());
}

// Validation -------------------------------------------------------------------

function validateUpload(body: UploadRequest) {
  if (typeof body.progress !== "object" || body.progress === null || Array.isArray(body.progress)) {
    throw new HttpError(400, "progress must be an object");
  }
  const progressBytes = new TextEncoder().encode(JSON.stringify(body.progress)).length;
  if (progressBytes > MAX_PROGRESS_BYTES) throw new HttpError(413, "progress is too large");

  const asOf = Date.parse(body.dataAsOf);
  if (Number.isNaN(asOf)) throw new HttpError(400, "dataAsOf is not a valid time");
  if (asOf > Date.now() + CLOCK_SKEW_MS) throw new HttpError(400, "dataAsOf is in the future");

  if (!body.backup) throw new HttpError(400, "backup is missing");
  const ciphertext = fromBase64(body.backup.ciphertext, "backup.ciphertext");
  const iv = fromBase64(body.backup.iv, "backup.iv");
  const ownerWrappedDek = fromBase64(body.backup.ownerWrappedDek, "backup.ownerWrappedDek");
  if (ciphertext.length > MAX_BACKUP_BYTES) throw new HttpError(413, "backup is too large");
  if (iv.length !== 12) throw new HttpError(400, "backup.iv must be 12 bytes");

  return { asOf: new Date(asOf).toISOString(), ciphertext, iv, ownerWrappedDek };
}

function validateRecoveryCodes(codes: UploadRequest["recoveryCodes"]) {
  if (!Array.isArray(codes) || codes.length !== RECOVERY_CODE_COUNT) {
    throw new HttpError(400, `${RECOVERY_CODE_COUNT} recovery codes are required`);
  }
  return codes.map((rc, i) => {
    if (!/^[0-9a-f]{64}$/.test(rc.codeHash ?? "")) {
      throw new HttpError(400, `recoveryCodes[${i}].codeHash must be 64 hex characters`);
    }
    return { code_hash: rc.codeHash, wrapped_dek: toByteaHex(fromBase64(rc.wrappedDek, `recoveryCodes[${i}].wrappedDek`)) };
  });
}

// Upload -----------------------------------------------------------------------

async function handleUpload(body: UploadRequest) {
  const v = validateUpload(body);
  const now = new Date();

  // Update path: live share + correct owner key.
  if (body.code && body.ownerKey) {
    const share = await findShare(body.code);
    if (share && isLive(share)) {
      const hash = await ownerKeyHash(body.ownerKey, "ownerKey");
      if (constantTimeEqual(hash, share.owner_key_hash)) {
        const expiresAt = share.is_permanent ? null : new Date(now.getTime() + SHARE_LIFETIME_MS).toISOString();
        const { error: e1 } = await db.from("shares").update({
          progress: body.progress,
          data_as_of: v.asOf,
          shared_at: now.toISOString(),
          expires_at: expiresAt,
        }).eq("id", share.id);
        if (e1) throw new HttpError(500, "update failed");

        const { error: e2 } = await db.from("share_backups").upsert({
          share_id: share.id,
          ciphertext: toByteaHex(v.ciphertext),
          iv: toByteaHex(v.iv),
          owner_wrapped_dek: toByteaHex(v.ownerWrappedDek),
          updated_at: now.toISOString(),
        });
        if (e2) throw new HttpError(500, "backup update failed");

        // 0 after an admin re-key: the browser must then make a new recovery set.
        const { count } = await db.from("share_recovery_codes")
          .select("id", { count: "exact", head: true })
          .eq("share_id", share.id).is("used_at", null);

        return {
          code: share.code, display: displayCode(share.code), isNew: false,
          sharedAt: now.toISOString(), dataAsOf: v.asOf,
          expiresAt, isPermanent: share.is_permanent,
          recoveryCodesLeft: count ?? 0,
        };
      }
    }
  }

  // Create path.
  if (!body.newOwnerKey) throw new HttpError(400, "newOwnerKey is required for a new share");
  const newHash = await ownerKeyHash(body.newOwnerKey, "newOwnerKey");
  const recovery = validateRecoveryCodes(body.recoveryCodes);
  const isPermanent = body.keepPermanent === true;
  const expiresAt = isPermanent ? null : new Date(now.getTime() + SHARE_LIFETIME_MS).toISOString();

  let created: { id: string; code: string } | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const code = generateCode();
    const { data: reserved } = await db.from("reserved_codes").select("code").eq("code", code).maybeSingle();
    if (reserved) continue;
    const { data: alias } = await db.from("share_aliases").select("alias").eq("alias", code).maybeSingle();
    if (alias) continue;

    const { data, error } = await db.from("shares").insert({
      code,
      owner_key_hash: newHash,
      progress: body.progress,
      data_as_of: v.asOf,
      shared_at: now.toISOString(),
      is_permanent: isPermanent,
      expires_at: expiresAt,
    }).select("id, code").single();
    if (!error) created = data;
    else if (error.code !== "23505") throw new HttpError(500, "create failed"); // 23505 = code taken
  }
  if (!created) throw new HttpError(503, "no free code, try again");

  // No transaction in supabase-js. If a later insert fails, delete the share;
  // the cascade removes the rows that were already written.
  const { error: e3 } = await db.from("share_backups").insert({
    share_id: created.id,
    ciphertext: toByteaHex(v.ciphertext),
    iv: toByteaHex(v.iv),
    owner_wrapped_dek: toByteaHex(v.ownerWrappedDek),
  });
  const { error: e4 } = e3 ? { error: e3 } : await db.from("share_recovery_codes")
    .insert(recovery.map((r) => ({ ...r, share_id: created!.id })));
  if (e3 || e4) {
    await db.from("shares").delete().eq("id", created.id);
    throw new HttpError(500, "create failed");
  }

  return {
    code: created.code, display: displayCode(created.code), isNew: true,
    sharedAt: now.toISOString(), dataAsOf: v.asOf,
    expiresAt, isPermanent,
    recoveryCodesLeft: RECOVERY_CODE_COUNT,
  };
}

// Delete -----------------------------------------------------------------------

async function handleDelete(body: DeleteRequest) {
  if (!body.code || !body.ownerKey) throw new HttpError(400, "code and ownerKey are required");
  const share = await findShare(body.code);
  const hash = await ownerKeyHash(body.ownerKey, "ownerKey");
  // Same answer for "not found" and "wrong key", so a code cannot be probed.
  if (!share || !constantTimeEqual(hash, share.owner_key_hash)) {
    throw new HttpError(404, "no share with that code and key");
  }
  const { error } = await db.from("shares").delete().eq("id", share.id);
  if (error) throw new HttpError(500, "delete failed");
  return { deleted: true };
}

// Restore ----------------------------------------------------------------------
// Every failed proof gets the same 404 answer, so a code cannot be probed.

const NO_MATCH = "no share with that code and proof";

async function handleUnlock(body: UnlockRequest) {
  if (!body.code) throw new HttpError(400, "code is required");
  if (!body.ownerKey === !body.recoveryCode) {
    throw new HttpError(400, "give ownerKey or recoveryCode, not both");
  }
  const share = await findShare(body.code);
  if (!share || !isLive(share)) throw new HttpError(404, NO_MATCH);

  const { data: backup } = await db.from("share_backups")
    .select("ciphertext, iv, owner_wrapped_dek, format_version, updated_at")
    .eq("share_id", share.id).maybeSingle();
  if (!backup) throw new HttpError(404, NO_MATCH);

  let wrappedDek: string;
  let via: "ownerKey" | "recoveryCode";
  if (body.ownerKey) {
    const hash = await ownerKeyHash(body.ownerKey, "ownerKey");
    if (!constantTimeEqual(hash, share.owner_key_hash)) throw new HttpError(404, NO_MATCH);
    wrappedDek = backup.owner_wrapped_dek;
    via = "ownerKey";
  } else {
    const hash = await recoveryCodeHash(body.recoveryCode!);
    const { data: rc } = await db.from("share_recovery_codes")
      .select("wrapped_dek").eq("share_id", share.id)
      .eq("code_hash", hash).is("used_at", null).maybeSingle();
    if (!rc) throw new HttpError(404, NO_MATCH);
    wrappedDek = rc.wrapped_dek;
    via = "recoveryCode";
  }

  const { count } = await db.from("share_recovery_codes")
    .select("id", { count: "exact", head: true })
    .eq("share_id", share.id).is("used_at", null);

  return {
    code: share.code, display: displayCode(share.code), via,
    backup: {
      ciphertext: byteaHexToBase64(backup.ciphertext),
      iv: byteaHexToBase64(backup.iv),
      wrappedDek: byteaHexToBase64(wrappedDek),
      formatVersion: backup.format_version,
      updatedAt: backup.updated_at,
    },
    recoveryCodesLeft: count ?? 0,
  };
}

async function handleClaim(body: ClaimRequest) {
  if (!body.code || !body.recoveryCode || !body.newOwnerKey || !body.newOwnerWrappedDek) {
    throw new HttpError(400, "code, recoveryCode, newOwnerKey and newOwnerWrappedDek are required");
  }
  const share = await findShare(body.code);
  if (!share) throw new HttpError(404, NO_MATCH);

  const codeHash = await recoveryCodeHash(body.recoveryCode);
  const newHash = await ownerKeyHash(body.newOwnerKey, "newOwnerKey");
  const wrapped = fromBase64(body.newOwnerWrappedDek, "newOwnerWrappedDek");

  const { data: ok, error } = await db.rpc("claim_recovery", {
    p_share_id: share.id,
    p_code_hash: codeHash,
    p_new_owner_key_hash: newHash,
    p_new_owner_wrapped_dek: toByteaHex(wrapped),
  });
  if (error) throw new HttpError(500, "claim failed");
  if (!ok) throw new HttpError(404, NO_MATCH);

  return { code: share.code, display: displayCode(share.code), claimed: true };
}

// New recovery set -------------------------------------------------------------

async function handleRecoverySet(body: RecoverySetRequest) {
  if (!body.code || !body.ownerKey) throw new HttpError(400, "code and ownerKey are required");
  const share = await findShare(body.code);
  const hash = await ownerKeyHash(body.ownerKey, "ownerKey");
  if (!share || !isLive(share) || !constantTimeEqual(hash, share.owner_key_hash)) {
    throw new HttpError(404, NO_MATCH);
  }

  // validateRecoveryCodes gives "\x<hex>"; the SQL function wants plain hex.
  const codes = validateRecoveryCodes(body.recoveryCodes).map((r) => ({
    code_hash: r.code_hash,
    wrapped_dek: r.wrapped_dek.slice(2),
  }));

  const { data: ok, error } = await db.rpc("replace_recovery_codes", {
    p_share_id: share.id,
    p_codes: codes,
  });
  if (error) throw new HttpError(500, "recovery set failed");
  if (!ok) throw new HttpError(404, NO_MATCH);

  return { code: share.code, display: displayCode(share.code), recoveryCodesLeft: RECOVERY_CODE_COUNT };
}

// Entry point ------------------------------------------------------------------

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "use POST" }, 405, origin);

  try {
    const length = Number(req.headers.get("content-length") ?? "0");
    if (length > MAX_BODY_BYTES) throw new HttpError(413, "request is too large");

    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "request is too large");
    let body: AnyRequest;
    try { body = JSON.parse(text); } catch { throw new HttpError(400, "body is not valid JSON"); }

    await checkRateLimit(req);

    if (body.action === "upload") return json(await handleUpload(body), 200, origin);
    if (body.action === "delete") return json(await handleDelete(body), 200, origin);
    if (body.action === "unlock") return json(await handleUnlock(body), 200, origin);
    if (body.action === "claim") return json(await handleClaim(body), 200, origin);
    if (body.action === "recovery-set") return json(await handleRecoverySet(body), 200, origin);
    throw new HttpError(400, "unknown action");
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status, origin);
    console.error(err);
    return json({ error: "server error" }, 500, origin);
  }
});

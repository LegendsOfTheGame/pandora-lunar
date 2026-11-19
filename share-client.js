/* Share profiles: browser side of the share Edge Function.
   Status: DRAFT. CONFIG is empty, so the Share frame shows "not available"
   until the Supabase project exists.

   Keys and what they protect (see supabase/functions/share/index.ts):
   - Owner key: 32 random bytes. Proves which browser owns a code.
     The server stores only SHA-256 of it.
   - Data key (DEK): 32 random bytes. Encrypts the character backup (AES-GCM).
     The server stores it only in wrapped form:
       * wrapped with a key from the owner key (HKDF-SHA-256),
       * wrapped with a key from each recovery code (PBKDF2-SHA-256).
   - Recovery code: 16 characters, shown as XXXX-XXXX-XXXX-XXXX.
     The server stores SHA-256 of the code (upper case, no dashes, UTF-8).
   A wrapped key is: IV (12 bytes) + AES-GCM ciphertext of the 32-byte DEK. */

const LunarShare = (() => {
  // Lunar project (ref dehuwlbcfejuiijbpaao). The anon key is public by design:
  // Row Level Security and the Edge Functions decide what it can do.
  // The legacy JWT anon key is used because the Edge Functions check a JWT.
  const CONFIG = {
    supabaseUrl: 'https://dehuwlbcfejuiijbpaao.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlaHV3bGJjZmVqdWlpamJwYWFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwNDk2NDMsImV4cCI6MjExMDYyNTY0M30.GPSDhfWybi0ECcpcz8jQPfp6If0jfMeJq2VfpQPAuGM',
  };

  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const RECOVERY_COUNT = 5;
  const PBKDF2_ROUNDS = 210000;
  const PBKDF2_SALT = new TextEncoder().encode('pandora-lunar share recovery v1');
  const HKDF_INFO = new TextEncoder().encode('pandora-lunar share owner v1');

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function available(){ return !!(CONFIG.supabaseUrl && CONFIG.anonKey); }

  /* ---------- encoding ---------- */
  function toB64(bytes){
    let bin = '';
    for(let i = 0; i < bytes.length; i += 0x8000){
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }
  function toB64Url(bytes){ return toB64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
  function fromB64(s){
    const std = String(s).trim().replace(/-/g,'+').replace(/_/g,'/');
    const bin = atob(std + '='.repeat((4 - std.length % 4) % 4));
    const out = new Uint8Array(bin.length);
    for(let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function concat(a, b){ const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; }
  function random(n){ return crypto.getRandomValues(new Uint8Array(n)); }

  function normalize(code){ return String(code || '').replace(/[^A-Za-z0-9]/g,'').toUpperCase(); }
  function displayCode(code){
    const c = normalize(code);
    return c.length === 8 ? c.slice(0,4) + '-' + c.slice(4)
         : c.length === 16 ? c.match(/.{4}/g).join('-') : c;
  }

  async function sha256Hex(bytes){
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return Array.from(d, b => b.toString(16).padStart(2,'0')).join('');
  }

  /* ---------- keys ---------- */
  function newOwnerKey(){ return toB64Url(random(32)); }
  function newDek(){ return toB64(random(32)); }
  function newRecoveryCode(){
    // 256 is a multiple of 32, so byte % 32 has no bias.
    return Array.from(random(16), b => ALPHABET[b % 32]).join('');
  }

  async function ownerWrapKey(ownerKey){
    const base = await crypto.subtle.importKey('raw', fromB64(ownerKey), 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey({name:'HKDF', hash:'SHA-256', salt:new Uint8Array(0), info:HKDF_INFO},
      base, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
  }
  async function recoveryWrapKey(code){
    const base = await crypto.subtle.importKey('raw', enc.encode(normalize(code)), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', salt:PBKDF2_SALT, iterations:PBKDF2_ROUNDS},
      base, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
  }
  async function wrapDek(dekB64, wrapKey){
    const iv = random(12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv}, wrapKey, fromB64(dekB64)));
    return toB64(concat(iv, ct));
  }
  async function unwrapDek(wrappedB64, wrapKey){
    const w = fromB64(wrappedB64);
    const raw = new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM', iv:w.subarray(0,12)}, wrapKey, w.subarray(12)));
    return toB64(raw);
  }
  async function dekKey(dekB64){
    return crypto.subtle.importKey('raw', fromB64(dekB64), {name:'AES-GCM'}, false, ['encrypt','decrypt']);
  }

  /* ---------- backup ---------- */
  async function encryptBackup(dekB64, obj){
    const iv = random(12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv}, await dekKey(dekB64), enc.encode(JSON.stringify(obj))));
    return { ciphertext: toB64(ct), iv: toB64(iv) };
  }
  async function decryptBackup(dekB64, ciphertextB64, ivB64){
    const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv:fromB64(ivB64)}, await dekKey(dekB64), fromB64(ciphertextB64));
    return JSON.parse(dec.decode(pt));
  }

  /* A new set of recovery codes for one DEK. Returns the plain codes (to show
     the player once) and the entries the server stores. */
  async function makeRecoverySet(dekB64){
    const codes = Array.from({length: RECOVERY_COUNT}, newRecoveryCode);
    const entries = await Promise.all(codes.map(async c => ({
      codeHash: await sha256Hex(enc.encode(c)),
      wrappedDek: await wrapDek(dekB64, await recoveryWrapKey(c)),
    })));
    return { codes: codes.map(displayCode), entries };
  }

  /* ---------- server ---------- */
  async function call(action, body){
    if(!available()) throw new Error('Sharing is not set up yet.');
    const res = await fetch(CONFIG.supabaseUrl + '/functions/v1/share', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + CONFIG.anonKey, 'apikey': CONFIG.anonKey },
      body: JSON.stringify(Object.assign({action}, body)),
    });
    let data = null;
    try{ data = await res.json(); }catch(e){ data = null; }
    if(!res.ok){
      const err = new Error((data && data.error) || ('The server answered ' + res.status));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function lookup(code){
    if(!available()) throw new Error('Sharing is not set up yet.');
    const res = await fetch(CONFIG.supabaseUrl + '/rest/v1/rpc/get_share', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + CONFIG.anonKey, 'apikey': CONFIG.anonKey },
      body: JSON.stringify({ lookup_code: code }),
    });
    if(!res.ok) throw new Error('The server answered ' + res.status);
    const rows = await res.json();
    return rows && rows[0] ? rows[0] : null;
  }

  /* ---------- flows ---------- */

  /* Upload one character. share is the character's saved share state
     ({code, ownerKey, dek} or null). backupObj is encrypted here.
     Every upload also prepares a fallback recovery set: when the server makes a
     NEW code (first share, or the old code expired), that set becomes live and
     its plain codes are returned to show once. */
  /* updateOnly (automatic updates): sends no new owner key and no recovery
     set, so the server can only UPDATE the existing code. If this browser no
     longer controls the code, the server refuses (400) instead of making a
     new code, and the caller stops automatic updates. */
  async function upload({share, progress, dataAsOf, backupObj, keepPermanent, updateOnly}){
    const ownerKey = (share && share.ownerKey) || newOwnerKey();
    const dek = (share && share.dek) || newDek();
    const backup = await encryptBackup(dek, backupObj);
    const ownerWrappedDek = await wrapDek(dek, await ownerWrapKey(ownerKey));
    const recovery = updateOnly ? null : await makeRecoverySet(dek);

    const r = await call('upload', {
      code: share && share.code || undefined,
      ownerKey: share && share.code ? ownerKey : undefined,
      newOwnerKey: updateOnly ? undefined : ownerKey,
      keepPermanent: !!keepPermanent,
      progress, dataAsOf,
      backup: { ciphertext: backup.ciphertext, iv: backup.iv, ownerWrappedDek },
      recoveryCodes: updateOnly ? undefined : recovery.entries,
    });
    return {
      share: { code: r.code, ownerKey, dek, isPermanent: r.isPermanent, expiresAt: r.expiresAt,
               sharedAt: r.sharedAt, dataAsOf: r.dataAsOf, recoveryCodesLeft: r.recoveryCodesLeft },
      isNew: r.isNew,
      recoveryCodes: r.isNew && recovery ? recovery.codes : null,
    };
  }

  async function fingerprint(obj){
    return sha256Hex(enc.encode(JSON.stringify(obj)));
  }

  async function remove(share){
    return call('delete', { code: share.code, ownerKey: share.ownerKey });
  }

  async function newRecoverySet(share){
    const recovery = await makeRecoverySet(share.dek);
    await call('recovery-set', { code: share.code, ownerKey: share.ownerKey, recoveryCodes: recovery.entries });
    return recovery.codes;
  }

  /* Restore with the owner key OR a recovery code, in two steps.
     Step 1 (this function) unlocks and decrypts the backup. It changes nothing
     on the server and spends no recovery code.
     Step 2 is finish(). Call it only after the player confirms. For a recovery
     code it spends the code and sets a new owner key (the old browser loses
     control), so the caller MUST save the returned share state at once.
     Fix, 19 Nov 2026: the claim used to run before the "Replace?" question;
     a Cancel then left the new owner key unsaved and the code with no owner. */
  async function restore({code, ownerKey, recoveryCode}){
    const r = await call('unlock', ownerKey ? {code, ownerKey} : {code, recoveryCode});
    const wrapKey = ownerKey ? await ownerWrapKey(ownerKey) : await recoveryWrapKey(recoveryCode);
    let dek;
    try{ dek = await unwrapDek(r.backup.wrappedDek, wrapKey); }
    catch(e){ throw new Error('The key does not unlock this backup.'); }
    const backupObj = await decryptBackup(dek, r.backup.ciphertext, r.backup.iv);

    async function finish(){
      let key = ownerKey;
      if(!ownerKey){
        key = newOwnerKey();
        await call('claim', { code, recoveryCode, newOwnerKey: key,
                              newOwnerWrappedDek: await wrapDek(dek, await ownerWrapKey(key)) });
      }
      return { code: r.code, ownerKey: key, dek, recoveryCodesLeft: r.recoveryCodesLeft - (ownerKey ? 0 : 1) };
    }
    return { backupObj, finish };
  }

  return { available, displayCode, normalize, upload, remove, newRecoverySet, restore, lookup, fingerprint };
})();

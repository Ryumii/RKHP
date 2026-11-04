"use strict";

globalThis.RKNewsWorker = (() => {
  const { SourceError, fail, readConfig, parseRows } = globalThis.RKSheetSource;
  const encoder = new TextEncoder();
  const jsonLimit = 2 * 1024 * 1024;
  const imageLimit = 10 * 1024 * 1024;
  const tokenUrl = "https://oauth2.googleapis.com/token";
  const fields = ["id", "category", "title", "publishedAt", "startsAt", "medium", "summary", "paragraphs", "url", "image", "imageAlt"];

  function safeError(error) {
    return error instanceof SourceError
      ? { code: error.code, ...(error.row ? { row: error.row } : {}) }
      : { code: "INTERNAL_ERROR" };
  }
  function log(error) {
    console.error("NEWS_SYNC_FAILED", JSON.stringify(safeError(error)));
  }
  async function digest(value) {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map(byte => byte.toString(16).padStart(2, "0")).join("");
  }
  async function scope(config) {
    const fingerprint = await digest(JSON.stringify([
      config.environment, config.spreadsheetId, config.worksheet, config.driveFolderId,
      config.account.client_email, config.columns, config.publicOrigin
    ]));
    return `private/${fingerprint}`;
  }
  function base64(bytes) {
    let result = "";
    for (const byte of bytes) result += String.fromCharCode(byte);
    return btoa(result).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  async function readBytes(response, limit) {
    if (Number(response.headers.get("content-length")) > limit) fail("RESPONSE_SIZE");
    if (!response.body) fail("UPSTREAM_RESPONSE");
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
          await reader.cancel();
          fail("RESPONSE_SIZE");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  }
  async function upstream(url, options, request, limit = jsonLimit) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await request(url, { ...options, signal: controller.signal, redirect: "error" });
      if (!response.ok) fail([401, 403, 404].includes(response.status) ? "GOOGLE_ACCESS" : "GOOGLE_REQUEST");
      return await readBytes(response, limit);
    } catch (error) {
      if (error instanceof SourceError) throw error;
      fail(controller.signal.aborted ? "GOOGLE_TIMEOUT" : "GOOGLE_NETWORK");
    } finally { clearTimeout(timer); }
  }
  function json(bytes) {
    try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { fail("UPSTREAM_RESPONSE"); }
  }
  async function accessToken(config, request, now) {
    const header = base64(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
    const claim = base64(encoder.encode(JSON.stringify({
      iss: config.account.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly",
      aud: tokenUrl, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 3600
    })));
    let key;
    try {
      const pem = config.account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
      key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), char => char.charCodeAt(0)),
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    } catch { fail("CONFIG_PRIVATE_KEY"); }
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(`${header}.${claim}`));
    const result = json(await upstream(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${header}.${claim}.${base64(new Uint8Array(signature))}`
      }).toString()
    }, request));
    if (typeof result.access_token !== "string" || !result.access_token || result.token_type?.toLowerCase() !== "bearer") fail("GOOGLE_TOKEN");
    return result.access_token;
  }
  async function google(path, token, request, headers = {}) {
    return json(await upstream("https://www.googleapis.com/" + path, {
      headers: { Authorization: `Bearer ${token}`, ...headers }
    }, request));
  }
  async function sourceValues(config, token, request) {
    const id = encodeURIComponent(config.spreadsheetId);
    const meta = await google(`sheets/v4/spreadsheets/${id}?fields=properties(timeZone),sheets(properties(title))`, token, request);
    if (meta.properties?.timeZone !== "Asia/Tokyo" || !meta.sheets?.some(sheet => sheet.properties?.title === config.worksheet)) fail("SHEET_SETTINGS");
    const range = encodeURIComponent(`'${config.worksheet.replace(/'/g, "''")}'`);
    const result = await google(`sheets/v4/spreadsheets/${id}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`, token, request);
    return result.values;
  }
  function imageType(bytes, mime) {
    if (mime === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
    if (mime === "image/png" && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return "png";
    if (mime === "image/webp" && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
        new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return "webp";
    fail("IMAGE_FORMAT");
  }
  async function importImage(record, config, token, request, bucket, prefix, previous, metadata, imported) {
    if (!config.driveFolderId) fail("IMAGE_FOLDER_REQUIRED", record.row);
    const ref = record.image;
    if (imported.has(ref.id)) return imported.get(ref.id);
    const resourceHeaders = ref.resourceKey ? { "X-Goog-Drive-Resource-Keys": `${ref.id}/${ref.resourceKey}` } : {};
    async function file(id, headers = {}) {
      if (!metadata.has(id)) {
        const result = await google(`drive/v3/files/${encodeURIComponent(id)}?fields=id,mimeType,parents,size,md5Checksum,modifiedTime,trashed,capabilities(canDownload)&supportsAllDrives=true`, token, request, headers);
        metadata.set(id, result);
      }
      return metadata.get(id);
    }
    const info = await file(ref.id, resourceHeaders);
    if (info.trashed || info.capabilities?.canDownload !== true ||
        !["image/jpeg", "image/png", "image/webp"].includes(info.mimeType) ||
        !Number.isFinite(Number(info.size)) || Number(info.size) <= 0 || Number(info.size) > imageLimit ||
        typeof info.modifiedTime !== "string") fail("IMAGE_FILE", record.row);
    let parents = info.parents || [], allowed = false;
    const visited = new Set([ref.id]);
    for (let depth = 0; parents.length && depth < 10; depth++) {
      if (parents.includes(config.driveFolderId)) { allowed = true; break; }
      const next = [];
      for (const parent of parents) {
        if (visited.has(parent)) continue;
        visited.add(parent);
        const folder = await file(parent);
        if (!folder.trashed && folder.mimeType === "application/vnd.google-apps.folder") next.push(...(folder.parents || []));
      }
      parents = next;
    }
    if (!allowed) fail("IMAGE_FOLDER", record.row);
    const cached = previous?.media?.find(image => image.fileId === ref.id && image.modifiedTime === info.modifiedTime && image.checksum === info.md5Checksum);
    if (cached && await bucket.head(`${prefix}/images/${cached.key}`)) {
      imported.set(ref.id, cached);
      return cached;
    }
    // shortcut: 画像のEXIF等は維持, 公開素材の自動メタデータ除去が必要になったら変換処理を追加する。
    const bytes = await upstream(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ref.id)}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}`, ...resourceHeaders }
    }, request, imageLimit);
    const extension = imageType(bytes, info.mimeType);
    // A new import must not reuse an object that an expired sync can remove.
    const key = `${await digest(`${await digest(bytes)}:${crypto.randomUUID()}`)}.${extension}`;
    await bucket.put(`${prefix}/images/${key}`, bytes, { httpMetadata: { contentType: info.mimeType } });
    const image = { key, fileId: ref.id, modifiedTime: info.modifiedTime, checksum: info.md5Checksum, mime: info.mimeType };
    imported.set(ref.id, image);
    return image;
  }
  async function saved(bucket, key) {
    const object = await bucket.get(key);
    return object ? object.json() : null;
  }
  async function lease(bucket, prefix, clock) {
    const key = `${prefix}/lease.json`;
    const previous = await bucket.get(key);
    if (previous && (await previous.json()).expiresAt > clock()) fail("SYNC_BUSY");
    const owner = crypto.randomUUID(), expiresAt = clock() + 240000;
    const result = await bucket.put(key, JSON.stringify({ owner, expiresAt }), {
      onlyIf: previous ? { etagMatches: previous.etag } : { etagDoesNotMatch: "*" }
    });
    if (!result) fail("SYNC_BUSY");
    return { key, owner, expiresAt, etag: result.etag };
  }
  async function writeStatus(bucket, prefix, active, status) {
    const key = `${prefix}/status.json`;
    const generation = active?.expiresAt || 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (active && (await saved(bucket, active.key))?.owner !== active.owner) return;
      const previous = await bucket.get(key);
      if (previous && ((await previous.json()).generation || 0) > generation) return;
      const written = await bucket.put(key, JSON.stringify({ ...status, generation }), {
        onlyIf: previous ? { etagMatches: previous.etag } : { etagDoesNotMatch: "*" }
      });
      if (written) return;
    }
    fail("STATUS_CONFLICT");
  }
  async function sync(env, request = globalThis.fetch, clock = Date.now) {
    let config, prefix, active, previous, previousVersion;
    const bucket = env.NEWS_BUCKET;
    try {
      config = readConfig(env);
      prefix = await scope(config);
      active = await lease(bucket, prefix, clock);
      previousVersion = await bucket.get(`${prefix}/snapshot.json`);
      previous = previousVersion ? await previousVersion.json() : null;
      const token = await accessToken(config, request, clock());
      const parsed = parseRows(await sourceValues(config, token, request), config, clock());
      const metadata = new Map(), imported = new Map(), media = [], items = [];
      for (const record of parsed.records) {
        const item = { ...record.item };
        if (record.image) {
          let image;
          try { image = await importImage(record, config, token, request, bucket, prefix, previous, metadata, imported); }
          catch (error) {
            if (error instanceof SourceError) throw new SourceError(error.code, record.row);
            throw error;
          }
          media.push(image);
          item.image = `${config.publicOrigin}/news-media/${image.key}`;
        }
        items.push(item);
      }
      const publicItems = globalThis.RKNews.selectNews(items);
      const currentLease = await saved(bucket, active.key);
      if (currentLease?.owner !== active.owner || clock() >= active.expiresAt - 1000) fail("SYNC_LEASE");
      const updatedAt = new Date(clock()).toISOString();
      const snapshot = { version: 1, updatedAt, items: publicItems, media };
      const written = await bucket.put(`${prefix}/snapshot.json`, JSON.stringify(snapshot), {
        httpMetadata: { contentType: "application/json" },
        onlyIf: previousVersion ? { etagMatches: previousVersion.etag } : { etagDoesNotMatch: "*" }
      });
      if (!written) fail("SYNC_CONFLICT");
      const currentKeys = new Set(media.map(image => image.key));
      for (const key of new Set((previous?.media || []).map(image => image.key))) {
        if (!currentKeys.has(key)) await bucket.delete(`${prefix}/images/${key}`);
      }
      await writeStatus(bucket, prefix, active, { updatedAt, rows: parsed.rows, error: null });
      return { updatedAt, count: publicItems.length };
    } catch (error) {
      const failure = safeError(error);
      log(error);
      if (failure.code !== "SYNC_BUSY" && prefix) {
        try {
          await writeStatus(bucket, prefix, active, { updatedAt: new Date(clock()).toISOString(), rows: [], error: failure });
        } catch { log(new SourceError("STATUS_STORAGE")); }
      }
      // shortcut: 失敗時の未参照画像は非公開で保持, 容量増加時に参照確認付きの回収処理を追加する。
      throw new SourceError(failure.code, failure.row);
    } finally {
      if (active) {
        try {
          await bucket.put(active.key, JSON.stringify({ owner: active.owner, expiresAt: 0 }), { onlyIf: { etagMatches: active.etag } });
        } catch { log(new SourceError("LEASE_STORAGE")); }
      }
    }
  }
  function response(body, status, config, cache = "no-store", type = "application/json; charset=utf-8") {
    return new Response(type.startsWith("application/json") ? JSON.stringify(body) : body, {
      status,
      headers: {
        "Content-Type": type, "Cache-Control": cache, "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow",
        ...(config ? { "Access-Control-Allow-Origin": config.siteOrigin, Vary: "Origin" } : {})
      }
    });
  }
  async function fetchRequest(request, env) {
    let config;
    try {
      config = readConfig(env);
      const url = new URL(request.url);
      if (url.origin !== config.publicOrigin || url.search) return response({ error: "Not found" }, 404, config);
      if (url.pathname === "/internal/status") {
        const token = env.STATUS_TOKEN;
        const authorization = request.headers.get("authorization") || "";
        if (request.method !== "GET" || typeof token !== "string" || token.length < 32 ||
            await digest(authorization) !== await digest(`Bearer ${token}`)) return response({ error: "Not found" }, 404);
        const result = await saved(env.NEWS_BUCKET, `${await scope(config)}/status.json`);
        return result ? response(result, 200) : response({ error: "Not ready" }, 503);
      }
      const originHeader = request.headers.get("origin");
      if (originHeader && originHeader !== config.siteOrigin) return response({ error: "Forbidden" }, 403);
      if (!["GET", "HEAD"].includes(request.method)) return response({ error: "Method not allowed" }, 405, config);
      const prefix = await scope(config);
      const snapshot = await saved(env.NEWS_BUCKET, `${prefix}/snapshot.json`);
      if (!snapshot) return response({ error: "ニュースは準備中です。" }, 503, config);
      if (url.pathname === "/api/news") {
        const status = await saved(env.NEWS_BUCKET, `${prefix}/status.json`);
        const items = globalThis.RKNews.selectNews(snapshot.items).map(item =>
          Object.fromEntries(fields.filter(field => Object.hasOwn(item, field)).map(field => [field, item[field]])));
        const result = response({ version: 1, updatedAt: snapshot.updatedAt, stale: Boolean(status?.error), items },
          200, config, "public, max-age=60, s-maxage=60, must-revalidate");
        return request.method === "HEAD" ? new Response(null, result) : result;
      }
      const media = url.pathname.match(/^\/news-media\/([a-f0-9]{64}\.(?:jpg|png|webp))$/);
      const image = media && snapshot.media.find(item => item.key === media[1]);
      if (!image) return response({ error: "Not found" }, 404, config);
      const object = await env.NEWS_BUCKET.get(`${prefix}/images/${image.key}`);
      if (!object) return response({ error: "Not found" }, 404, config);
      return response(request.method === "HEAD" ? null : object.body, 200, config,
        "public, max-age=60, s-maxage=60, must-revalidate", image.mime);
    } catch (error) {
      log(error);
      return response({ error: "ニュースを取得できませんでした。" }, 503, config);
    }
  }
  return Object.freeze({ sync, fetch: fetchRequest });
})();

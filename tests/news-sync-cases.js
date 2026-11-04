"use strict";

globalThis.RKNewsChecks = (() => {
  const checks = [];
  const test = (name, run) => checks.push({ name, run });
  const expect = (condition, message = "Assertion failed") => { if (!condition) throw new Error(message); };
  const equal = (actual, expected) => expect(JSON.stringify(actual) === JSON.stringify(expected), "Values differ");
  const { readConfig, parseRows, date, driveImage } = globalThis.RKSheetSource;
  const worker = globalThis.RKNewsWorker;
  const now = Date.parse("2026-11-04T12:00:00+09:00");
  const titles = ["記事ID", "公開状態", "掲載日時", "タイトル", "カテゴリ", "本文", "出演・開催日時", "外部リンク", "画像URL", "画像の説明"];
  const row = (id = "news-one", publishedAt = "2026/11/04 10:00", status = "公開") =>
    [id, status, publishedAt, "記事のタイトル", "メディア", "本文です。\n2段落目です。", "", "https://example.com/program", "", ""];
  const source = {
    spreadsheetId: "private-sheet-example-0001", worksheet: "フォームの回答 1",
    driveFolderId: "private-folder-example-0001"
  };
  function environment() {
    return {
      NEWS_ENV: "test", NEWS_SOURCE: JSON.stringify(source),
      GOOGLE_SERVICE_ACCOUNT: JSON.stringify({ client_email: "reader@news-test.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nplaceholder\n-----END PRIVATE KEY-----" }),
      PUBLIC_ORIGIN: "https://news-test.example.com", SITE_ORIGIN: "https://site-test.example.com",
      STATUS_TOKEN: "test-only-not-a-real-token-0000000000"
    };
  }
  async function rejectsCode(run, code) {
    let caught;
    try { await run(); } catch (error) { caught = error; }
    expect(caught?.code === code, `Expected ${code}, got ${caught?.code || "no error"}`);
  }
  class Bucket {
    constructor() { this.objects = new Map(); this.sequence = 0; }
    async head(key) {
      const entry = this.objects.get(key);
      return entry ? { etag: entry.etag } : null;
    }
    async get(key) {
      const entry = this.objects.get(key);
      if (!entry) return null;
      const bytes = entry.bytes.slice();
      return {
        etag: entry.etag, body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
        json: async () => JSON.parse(new TextDecoder().decode(bytes))
      };
    }
    async put(key, value, options = {}) {
      const previous = this.objects.get(key), condition = options.onlyIf;
      if (condition?.etagDoesNotMatch === "*" && previous) return null;
      if (condition?.etagMatches && previous?.etag !== condition.etagMatches) return null;
      const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value).slice();
      const entry = { bytes, etag: `version-${++this.sequence}` };
      this.objects.set(key, entry);
      return { etag: entry.etag };
    }
    async delete(key) { this.objects.delete(key); }
  }
  let pairPromise;
  async function fixture() {
    pairPromise ||= crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    const pair = await pairPromise;
    const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
    const pem = "-----BEGIN PRIVATE KEY-----\n" + btoa(Array.from(der, byte => String.fromCharCode(byte)).join("")) + "\n-----END PRIVATE KEY-----";
    const env = environment();
    env.GOOGLE_SERVICE_ACCOUNT = JSON.stringify({ client_email: "reader@news-test.iam.gserviceaccount.com", private_key: pem });
    env.NEWS_BUCKET = new Bucket();
    const state = {
      env, values: [titles, row()], requests: [], mediaDownloads: 0, fail: false,
      bytes: new Uint8Array([255, 216, 255, 224, 0, 1, 2, 3]),
      file: { id: "private-image-example-0001", mimeType: "image/jpeg", parents: ["private-question-folder-0001"], size: "8", modifiedTime: "2026-11-04T00:00:00Z", md5Checksum: "example-checksum", capabilities: { canDownload: true } }
    };
    state.request = async (input, options) => {
      const url = new URL(input);
      state.requests.push({ url: url.href, method: options.method || "GET" });
      if (state.fail) throw new Error("private-sheet-example-0001 token and upstream detail must not be logged");
      if (url.href === "https://oauth2.googleapis.com/token") {
        const assertion = new URLSearchParams(options.body).get("assertion");
        const [header, payload, signature] = assertion.split(".");
        const bytes = value => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
        expect(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", pair.publicKey, bytes(signature), new TextEncoder().encode(`${header}.${payload}`)));
        const claim = JSON.parse(new TextDecoder().decode(bytes(payload)));
        expect(claim.scope.endsWith("drive.readonly") && claim.scope.includes("spreadsheets.readonly"));
        return Response.json({ access_token: "mock-google-access-token", token_type: "Bearer" });
      }
      expect(url.origin === "https://www.googleapis.com", "A source URL was fetched directly");
      expect(options.headers.Authorization === "Bearer mock-google-access-token");
      expect((options.method || "GET") === "GET", "Google data must remain read-only");
      if (url.pathname.includes("/values/")) return Response.json({ values: state.values });
      if (url.pathname.startsWith("/sheets/v4/")) return Response.json({ properties: { timeZone: state.timeZone || "Asia/Tokyo" }, sheets: [{ properties: { title: source.worksheet } }] });
      if (url.searchParams.get("alt") === "media") { state.mediaDownloads++; return new Response(state.bytes); }
      if (url.pathname.endsWith("/private-question-folder-0001")) return Response.json({ mimeType: "application/vnd.google-apps.folder", parents: [source.driveFolderId] });
      if (url.pathname.endsWith("/private-image-example-0001")) return Response.json(state.file);
      throw new Error("Unexpected Google request");
    };
    state.sync = () => worker.sync(env, state.request, () => now);
    // Browser Request strips Origin; the edge request retains that header.
    state.api = (path = "/api/news", options = {}) => worker.fetch({
      url: env.PUBLIC_ORIGIN + path, method: options.method || "GET", headers: new Headers(options.headers)
    }, env);
    return state;
  }
  test("headers determine columns, not their order; Forms email and timestamp stay private", () => {
    const config = readConfig(environment());
    const headers = ["メールアドレス", "タイムスタンプ", ...titles].reverse();
    const original = ["private@example.com", "2099/12/31", ...row()].reverse();
    const result = parseRows([headers, original], config, now);
    equal(result.records[0].item.title, "記事のタイトル");
    expect(!JSON.stringify(result.records).includes("private@example.com"));
    equal(result.records[0].item.publishedAt, "2026-11-04T10:00:00+09:00");
  });
  test("custom Form question names are mapped without rewriting content code", () => {
    const env = environment();
    env.NEWS_SOURCE = JSON.stringify({ ...source, columns: { title: "ニュース見出し", image: "添付画像" } });
    const headers = titles.map(name => name === "タイトル" ? "ニュース見出し" : name === "画像URL" ? "添付画像" : name);
    equal(parseRows([headers, row()], readConfig(env), now).records.length, 1);
  });
  test("missing and duplicate mapped headers stop publication", async () => {
    await rejectsCode(() => parseRows([titles.filter(name => name !== "記事ID"), row()], readConfig(environment()), now), "SHEET_HEADERS");
    await rejectsCode(() => parseRows([[...titles, "タイトル"], row()], readConfig(environment()), now), "SHEET_HEADERS");
  });
  test("optional columns may be omitted, but explicitly mapped columns must exist", async () => {
    equal(parseRows([titles.slice(0, 6), row().slice(0, 6)], readConfig(environment()), now).records.length, 1);
    const env = environment();
    env.NEWS_SOURCE = JSON.stringify({ ...source, columns: { image: "添付画像" } });
    await rejectsCode(() => parseRows([titles, row()], readConfig(env), now), "SHEET_HEADERS");
  });
  test("invalid mappings and credential-bearing origins are rejected without echoing settings", async () => {
    const env = environment();
    env.NEWS_SOURCE = JSON.stringify({ ...source, columns: { status: "タイトル" } });
    await rejectsCode(() => readConfig(env), "CONFIG_COLUMNS");
    env.NEWS_SOURCE = JSON.stringify(source);
    env.PUBLIC_ORIGIN = "https://user:password@example.com";
    await rejectsCode(() => readConfig(env), "CONFIG_ORIGIN");
  });
  test("dates accept JST calendar values and Sheets serial values", () => {
    equal(date("2026/11/04", 2), "2026-11-04T00:00:00+09:00");
    const serial = (Date.UTC(2026, 10, 4, 10, 30) - Date.UTC(1899, 11, 30)) / 86400000;
    equal(date(serial, 2), "2026-11-04T10:30:00+09:00");
  });
  test("impossible dates and ambiguous dates are never defaulted", async () => {
    for (const value of ["2026/02/30", "11/04/2026", "", "2026/11/04 25:00"]) await rejectsCode(() => date(value, 3), "DATE_INVALID");
  });
  test("shuffled rows sort newest first with ID tie-breaker, not Forms timestamp", () => {
    const values = [titles, row("news-z", "2026/10/20"), row("news-b", "2026/11/04"), row("news-a", "2026/11/04"), row("news-m", "2026/11/02")];
    const items = parseRows(values, readConfig(environment()), now).records.map(record => record.item);
    equal(globalThis.RKNews.selectNews(items).map(item => item.id), ["news-a", "news-b", "news-m", "news-z"]);
    equal(items[0].id, "news-z");
  });
  test("drafts, ended articles and future publications never enter public records", () => {
    const pending = row("news-future", "2027/01/01");
    const draft = row("", "", "下書き"); draft[3] = ""; draft[5] = "";
    const result = parseRows([titles, draft, pending, row("news-ended", "", "公開終了"), row()], readConfig(environment()), now);
    equal(result.records.map(record => record.item.id), ["news-one"]);
  });
  test("blank status means draft and published rows need stable unique IDs", async () => {
    equal(parseRows([titles, row("news-draft", "", "")], readConfig(environment()), now).records.length, 0);
    await rejectsCode(() => parseRows([titles, row("")], readConfig(environment()), now), "ID_INVALID");
    await rejectsCode(() => parseRows([titles, row(), row()], readConfig(environment()), now), "ID_INVALID");
  });
  test("private sheet references in user-facing content are blocked", async () => {
    const record = row(); record[5] = source.spreadsheetId;
    await rejectsCode(() => parseRows([titles, record], readConfig(environment()), now), "PRIVATE_REFERENCE");
    record[5] = "本文"; record[7] = "https://docs.google.com/spreadsheets/d/private-source";
    await rejectsCode(() => parseRows([titles, record], readConfig(environment()), now), "LINK_INVALID");
  });
  test("both standard Drive sharing links and Form upload links are supported", () => {
    equal(driveImage("https://drive.google.com/open?id=private-image-example-0001", 2).id, "private-image-example-0001");
    equal(driveImage("https://drive.google.com/file/d/private-image-example-0001/view?usp=sharing", 2).id, "private-image-example-0001");
  });
  test("multiple uploads, arbitrary hosts, folder URLs and URL credentials are rejected", async () => {
    await rejectsCode(() => driveImage("https://drive.google.com/open?id=image-file-0001, https://drive.google.com/open?id=image-file-0002", 2), "IMAGE_COUNT");
    for (const url of ["https://evil.example.com/file/d/image-file-0001/view", "https://drive.google.com/drive/folders/image-folder-0001", "https://user:pass@drive.google.com/open?id=image-file-0001"]) {
      await rejectsCode(() => driveImage(url, 2), "IMAGE_LINK");
    }
  });
  test("initial API is unavailable until a successful sync, with no source identifiers", async () => {
    const state = await fixture();
    const result = await state.api();
    equal(result.status, 503);
    expect(!(await result.text()).includes(source.spreadsheetId));
  });
  test("a text-only test sheet can be published before its Form upload folder exists", async () => {
    const state = await fixture();
    const { driveFolderId, ...withoutFolder } = source;
    state.env.NEWS_SOURCE = JSON.stringify(withoutFolder);
    await state.sync();
    equal((await (await state.api()).json()).items.length, 1);
    equal(state.mediaDownloads, 0);
  });
  test("a missing upload folder blocks image access instead of accepting arbitrary files", async () => {
    const state = await fixture();
    const { driveFolderId, ...withoutFolder } = source;
    state.env.NEWS_SOURCE = JSON.stringify(withoutFolder);
    state.values[1][8] = "https://drive.google.com/open?id=" + state.file.id;
    state.values[1][9] = "画像";
    await rejectsCode(() => state.sync(), "IMAGE_FOLDER_REQUIRED");
    equal(state.mediaDownloads, 0);
    equal((await state.api()).status, 503);
  });
  test("sync signs read-only Google OAuth and exposes only allowlisted public fields", async () => {
    const state = await fixture();
    await state.sync();
    const response = await state.api(), result = await response.json();
    equal(response.status, 200);
    equal(result.items.length, 1);
    equal(result.stale, false);
    const text = JSON.stringify(result);
    for (const value of [source.spreadsheetId, source.driveFolderId, source.worksheet, "gserviceaccount", "mock-google-access-token", "fileId", "rows", "account"]) expect(!text.includes(value));
  });
  test("different sheets and accounts cannot read the last test snapshot", async () => {
    const state = await fixture();
    await state.sync();
    state.env.NEWS_SOURCE = JSON.stringify({ ...source, spreadsheetId: "private-production-sheet-0002" });
    equal((await state.api()).status, 503);
    state.env.NEWS_SOURCE = JSON.stringify(source);
    const account = JSON.parse(state.env.GOOGLE_SERVICE_ACCOUNT);
    account.client_email = "reader@production.iam.gserviceaccount.com";
    state.env.GOOGLE_SERVICE_ACCOUNT = JSON.stringify(account);
    equal((await state.api()).status, 503);
  });
  test("environment switching remains isolated even if a bucket was accidentally reused", async () => {
    const state = await fixture(); await state.sync();
    state.env.NEWS_ENV = "production";
    equal((await state.api()).status, 503);
  });
  test("failed fetch preserves the last good version and marks it stale without leaking errors", async () => {
    const state = await fixture(); await state.sync(); state.fail = true;
    await rejectsCode(() => state.sync(), "GOOGLE_NETWORK");
    const response = await state.api(), result = await response.json();
    equal(result.stale, true); equal(result.items.length, 1);
    expect(!JSON.stringify(result).includes("private-sheet"));
  });
  test("bad publication data leaves the previous published snapshot intact", async () => {
    const state = await fixture(); await state.sync(); state.values[1][2] = "2026/02/30";
    await rejectsCode(() => state.sync(), "DATE_INVALID");
    equal((await (await state.api()).json()).items[0].publishedAt, "2026-11-04T10:00:00+09:00");
  });
  test("wrong sheet timezone prevents publication", async () => {
    const state = await fixture(); state.timeZone = "America/Los_Angeles";
    await rejectsCode(() => state.sync(), "SHEET_SETTINGS");
    equal((await state.api()).status, 503);
  });
  test("Drive images under Form question subfolders are imported, not proxied by source URL", async () => {
    const state = await fixture(); state.values[1][8] = "https://drive.google.com/open?id=" + state.file.id; state.values[1][9] = "番組の画像";
    await state.sync();
    const result = await (await state.api()).json(), url = new URL(result.items[0].image);
    expect(/^\/news-media\/[a-f0-9]{64}\.jpg$/.test(url.pathname));
    equal(state.mediaDownloads, 1);
    const image = await state.api(url.pathname);
    equal(image.status, 200); equal(image.headers.get("content-type"), "image/jpeg");
    equal([...new Uint8Array(await image.arrayBuffer())], [...state.bytes]);
    expect(!JSON.stringify(result).includes(state.file.id));
  });
  test("unchanged images are reused, but the same Drive link can import revised content", async () => {
    const state = await fixture(); state.values[1][8] = "https://drive.google.com/open?id=" + state.file.id; state.values[1][9] = "画像";
    await state.sync(); const first = (await (await state.api()).json()).items[0].image;
    await state.sync(); equal(state.mediaDownloads, 1);
    state.file.modifiedTime = "2026-11-04T01:00:00Z"; state.file.md5Checksum = "changed";
    state.bytes = new Uint8Array([255, 216, 255, 224, 1, 2, 3, 4]);
    await state.sync(); expect((await (await state.api()).json()).items[0].image !== first);
    equal(state.mediaDownloads, 2);
    equal((await state.api(new URL(first).pathname)).status, 404);
  });
  test("unpublishing one of two articles retains a shared image; ending both removes access", async () => {
    const state = await fixture();
    const first = row("news-first"), second = row("news-second");
    for (const item of [first, second]) { item[8] = "https://drive.google.com/open?id=" + state.file.id; item[9] = "画像"; }
    state.values = [titles, first, second]; await state.sync();
    const path = new URL((await (await state.api()).json()).items[0].image).pathname;
    first[1] = "公開終了"; await state.sync(); equal((await state.api(path)).status, 200);
    second[1] = "公開終了"; await state.sync(); equal((await state.api(path)).status, 404);
    equal((await (await state.api()).json()).items.length, 0);
  });
  test("out-of-folder files and disguised HTML images cannot be published", async () => {
    const state = await fixture(); state.values[1][8] = "https://drive.google.com/open?id=" + state.file.id; state.values[1][9] = "画像";
    state.file.parents = [];
    await rejectsCode(() => state.sync(), "IMAGE_FOLDER");
    state.file.parents = [source.driveFolderId]; state.bytes = new TextEncoder().encode("<html>not an image</html>");
    await rejectsCode(() => state.sync(), "IMAGE_FORMAT");
    equal((await state.api()).status, 503);
  });
  test("image sizes are enforced before downloading private files", async () => {
    const state = await fixture(); state.values[1][8] = "https://drive.google.com/open?id=" + state.file.id; state.values[1][9] = "画像"; state.file.size = String(10 * 1024 * 1024 + 1);
    await rejectsCode(() => state.sync(), "IMAGE_FILE");
    equal(state.mediaDownloads, 0);
  });
  test("public routes cannot select a sheet, disclose status or perform writes", async () => {
    const state = await fixture(); await state.sync();
    equal((await state.api("/api/news?sheet=private-secret")).status, 404);
    equal((await state.api("/internal/status")).status, 404);
    equal((await state.api("/api/news", { method: "POST" })).status, 405);
    equal((await state.api("/api/news", { headers: { Origin: "https://attacker.example.com" } })).status, 403);
    const status = await state.api("/internal/status", { headers: { Authorization: "Bearer " + state.env.STATUS_TOKEN } });
    equal(status.status, 200);
    const data = await status.json(); equal(data.rows[0].state, "公開済み");
    expect(!JSON.stringify(data).includes(source.spreadsheetId));
  });
  test("concurrent sync cannot overwrite a job holding the conditional R2 lease", async () => {
    const state = await fixture(); let release, entered;
    const started = new Promise(resolve => { entered = resolve; });
    const request = async (url, options) => {
      if (String(url) === "https://oauth2.googleapis.com/token") { entered(); await new Promise(resolve => { release = resolve; }); }
      return state.request(url, options);
    };
    const running = worker.sync(state.env, request, () => now);
    await started;
    await rejectsCode(() => state.sync(), "SYNC_BUSY");
    release(); await running;
    equal((await state.api()).status, 200);
  });
  test("frontend live mode uses API news and never a sample fallback", async () => {
    const state = await fixture(); await state.sync();
    const result = await globalThis.RKNews.loadNews({ mode: "api", endpoint: state.env.PUBLIC_ORIGIN + "/api/news" }, [{ id: "fake-sample" }], () => state.api());
    equal(result.sample, false); equal(result.items[0].id, "news-one");
    let rejected = false;
    try { await globalThis.RKNews.loadNews({ mode: "api", endpoint: state.env.PUBLIC_ORIGIN + "/api/news" }, [], async () => new Response("", { status: 503 })); }
    catch { rejected = true; }
    expect(rejected);
  });
  test("frontend rejects Google source links and unconfigured modes", async () => {
    for (const config of [undefined, { mode: "other" }, { mode: "api", endpoint: "https://docs.google.com/api/news" }]) {
      let rejected = false;
      try { await globalThis.RKNews.loadNews(config, []); } catch { rejected = true; }
      expect(rejected);
    }
  });
  test("normal logs contain only fixed codes and row numbers, never upstream identifiers", async () => {
    const state = await fixture(); state.fail = true;
    const messages = [], original = console.error;
    try {
      console.error = (...parts) => messages.push(parts.join(" "));
      await rejectsCode(() => state.sync(), "GOOGLE_NETWORK");
    } finally { console.error = original; }
    expect(messages.some(message => message.includes("GOOGLE_NETWORK")));
    for (const value of [source.spreadsheetId, source.driveFolderId, "upstream detail", "gserviceaccount", "access-token"]) {
      expect(!messages.some(message => message.includes(value)));
    }
  });
  test("API serialization excludes unexpected private snapshot fields and limits caching", async () => {
    const state = await fixture(); await state.sync();
    const bucket = state.env.NEWS_BUCKET;
    const key = Array.from(bucket.objects.keys()).find(value => value.endsWith("/snapshot.json"));
    const snapshot = await (await bucket.get(key)).json();
    snapshot.privateSource = source.spreadsheetId;
    snapshot.items[0].editorEmail = "private-editor@example.com";
    await bucket.put(key, JSON.stringify(snapshot));
    const response = await state.api(), result = await response.text();
    expect(!result.includes(source.spreadsheetId) && !result.includes("private-editor"));
    expect(response.headers.get("cache-control").includes("max-age=60"));
    equal(response.headers.get("access-control-allow-origin"), state.env.SITE_ORIGIN);
  });
  test("a valid empty sheet publishes an explicit empty list rather than sample news", async () => {
    const state = await fixture(); state.values = [titles];
    await state.sync();
    const response = await state.api();
    equal(response.status, 200);
    equal((await response.json()).items, []);
  });
  test("a lost snapshot version cannot overwrite a concurrent publication", async () => {
    const state = await fixture();
    const original = state.env.NEWS_BUCKET.put.bind(state.env.NEWS_BUCKET);
    state.env.NEWS_BUCKET.put = async (key, value, options) => {
      if (key.endsWith("/snapshot.json")) return null;
      return original(key, value, options);
    };
    await rejectsCode(() => state.sync(), "SYNC_CONFLICT");
    equal((await state.api()).status, 503);
  });
  test("an expired sync cannot remove a newer publication's image or health status", async () => {
    const state = await fixture();
    state.values[1][8] = "https://drive.google.com/open?id=" + state.file.id;
    state.values[1][9] = "画像";
    let time = now, paused = false, release, entered;
    const waiting = new Promise(resolve => { entered = resolve; });
    const resume = new Promise(resolve => { release = resolve; });
    const bucket = state.env.NEWS_BUCKET;
    const original = bucket.put.bind(bucket);
    bucket.put = async (key, value, options) => {
      const result = await original(key, value, options);
      if (!paused && key.includes("/images/")) { paused = true; entered(); await resume; }
      return result;
    };
    const older = worker.sync(state.env, state.request, () => time);
    const olderResult = older.then(() => null, error => error);
    try {
      await waiting;
      time += 241000;
      await worker.sync(state.env, state.request, () => time);
      const latest = await (await state.api()).json();
      const path = new URL(latest.items[0].image).pathname;
      release();
      equal((await olderResult)?.code, "SYNC_LEASE");
      equal((await state.api(path)).status, 200);
      equal((await (await state.api()).json()).stale, false);
    } finally { release(); await olderResult; }
  });
  test("a lost publication acknowledgement does not delete a committed image", async () => {
    const state = await fixture();
    state.values[1][8] = "https://drive.google.com/open?id=" + state.file.id;
    state.values[1][9] = "画像";
    const bucket = state.env.NEWS_BUCKET, original = bucket.put.bind(bucket);
    bucket.put = async (key, value, options) => {
      const result = await original(key, value, options);
      if (key.endsWith("/snapshot.json")) throw new Error("mock lost storage acknowledgement");
      return result;
    };
    await rejectsCode(() => state.sync(), "INTERNAL_ERROR");
    const result = await (await state.api()).json();
    equal(result.items.length, 1);
    equal((await state.api(new URL(result.items[0].image).pathname)).status, 200);
    equal(result.stale, true);
  });
  test("delayed old-image cleanup cannot delete an image reimported by a newer sync", async () => {
    const state = await fixture();
    state.values[1][8] = "https://drive.google.com/open?id=" + state.file.id;
    state.values[1][9] = "画像";
    const originalBytes = state.bytes.slice(), originalFile = { ...state.file };
    await state.sync();
    const originalPath = new URL((await (await state.api()).json()).items[0].image).pathname;
    const oldKey = originalPath.split("/").pop();
    state.bytes = new Uint8Array([255, 216, 255, 224, 1, 2, 3, 4]);
    state.file = { ...state.file, modifiedTime: "2026-11-04T01:00:00Z", md5Checksum: "revised" };
    let time = now, paused = false, release, entered;
    const waiting = new Promise(resolve => { entered = resolve; });
    const resume = new Promise(resolve => { release = resolve; });
    const bucket = state.env.NEWS_BUCKET, originalDelete = bucket.delete.bind(bucket);
    bucket.delete = async key => {
      if (!paused && key.endsWith("/images/" + oldKey)) { paused = true; entered(); await resume; }
      return originalDelete(key);
    };
    const olderResult = worker.sync(state.env, state.request, () => time).then(() => null, error => error);
    try {
      await waiting;
      time += 241000;
      state.bytes = originalBytes; state.file = originalFile;
      await worker.sync(state.env, state.request, () => time);
      const latestPath = new URL((await (await state.api()).json()).items[0].image).pathname;
      expect(latestPath !== originalPath);
      release();
      equal(await olderResult, null);
      equal((await state.api(latestPath)).status, 200);
    } finally { release(); await olderResult; }
  });
  return checks;
})();

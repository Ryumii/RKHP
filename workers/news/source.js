"use strict";

globalThis.RKSheetSource = (() => {
  const headers = Object.freeze({
    id: "記事ID", status: "公開状態", publishedAt: "掲載日時", title: "タイトル",
    category: "カテゴリ", body: "本文", startsAt: "出演・開催日時",
    url: "外部リンク", image: "画像URL", imageAlt: "画像の説明"
  });
  const required = ["id", "status", "publishedAt", "title", "category", "body"];
  const categoryCodes = Object.freeze({ "メディア": "media", "イベント": "event", "お知らせ": "info" });

  class SourceError extends Error {
    constructor(code, row) {
      super(code);
      this.name = "SourceError";
      this.code = code;
      if (Number.isInteger(row)) this.row = row;
    }
  }
  function fail(code, row) {
    throw new SourceError(code, row);
  }
  function identifier(value) {
    return typeof value === "string" && /^[a-zA-Z0-9_-]{10,200}$/.test(value);
  }
  function origin(value) {
    if (typeof value !== "string") fail("CONFIG_ORIGIN");
    let url;
    try { url = new URL(value); } catch { fail("CONFIG_ORIGIN"); }
    if (url.protocol !== "https:" || url.username || url.password || url.origin !== value) fail("CONFIG_ORIGIN");
    return value;
  }
  function readConfig(env) {
    let config, account;
    try {
      config = JSON.parse(env.NEWS_SOURCE);
    } catch { fail("CONFIG_JSON"); }
    if (!config || typeof config !== "object" || Array.isArray(config) ||
        !["test", "production"].includes(env.NEWS_ENV)) fail("CONFIG_SOURCE");
    if (config.mode === "push") {
      if (Object.keys(config).some(key => !["mode", "namespace"].includes(key)) ||
          typeof config.namespace !== "string" || !/^[a-z0-9-]{10,100}$/.test(config.namespace) ||
          typeof env.NEWS_PUBLISH_TOKEN !== "string" || !/^[A-Za-z0-9_-]{32,200}$/.test(env.NEWS_PUBLISH_TOKEN)) fail("CONFIG_PUBLISHER");
      return {
        mode: "push", namespace: config.namespace, publishToken: env.NEWS_PUBLISH_TOKEN,
        environment: env.NEWS_ENV, publicOrigin: origin(env.PUBLIC_ORIGIN), siteOrigin: origin(env.SITE_ORIGIN),
        columns: { ...headers }, overrides: [], account: null, spreadsheetId: "", driveFolderId: ""
      };
    }
    if (config.mode !== undefined && config.mode !== "pull") fail("CONFIG_SOURCE");
    try { account = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT); } catch { fail("CONFIG_JSON"); }
    if (!config || !account || typeof config !== "object" || Array.isArray(config) ||
        !["test", "production"].includes(env.NEWS_ENV) ||
        !identifier(config.spreadsheetId) ||
        (config.driveFolderId !== undefined && config.driveFolderId !== "" && !identifier(config.driveFolderId)) ||
        typeof config.worksheet !== "string" || !config.worksheet.trim() ||
        config.worksheet.length > 100 || /[\r\n]/.test(config.worksheet)) fail("CONFIG_SOURCE");
    if (Object.keys(config).some(key => !["mode", "spreadsheetId", "driveFolderId", "worksheet", "columns"].includes(key))) fail("CONFIG_SOURCE");
    if (typeof account.client_email !== "string" || !/^[^@\s]+@[^@\s]+\.gserviceaccount\.com$/.test(account.client_email) ||
        typeof account.private_key !== "string" || !account.private_key.startsWith("-----BEGIN PRIVATE KEY-----")) fail("CONFIG_ACCOUNT");
    if (config.columns !== undefined && (!config.columns || typeof config.columns !== "object" || Array.isArray(config.columns))) fail("CONFIG_COLUMNS");
    const columns = { ...headers };
    for (const [field, label] of Object.entries(config.columns || {})) {
      if (!Object.hasOwn(headers, field) || typeof label !== "string" || !label.trim() || label.length > 100) fail("CONFIG_COLUMNS");
      columns[field] = label.trim();
    }
    if (new Set(Object.values(columns)).size !== Object.keys(columns).length) fail("CONFIG_COLUMNS");
    return {
      ...config, mode: "pull", driveFolderId: config.driveFolderId || "", columns, overrides: Object.keys(config.columns || {}), account, environment: env.NEWS_ENV,
      publicOrigin: origin(env.PUBLIC_ORIGIN), siteOrigin: origin(env.SITE_ORIGIN)
    };
  }
  function date(value, row) {
    let input = value;
    if (typeof value === "number" && Number.isFinite(value)) {
      const local = new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400) * 1000);
      if (!Number.isFinite(local.getTime())) fail("DATE_INVALID", row);
      input = local.toISOString().slice(0, 19) + "+09:00";
    } else if (typeof value === "string") {
      const local = value.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
      if (local) {
        const [, y, m, d, h = "0", min = "00", s = "00"] = local;
        input = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${min}:${s}+09:00`;
      } else input = value.trim();
    } else fail("DATE_INVALID", row);
    try { globalThis.RKNews.formatDate(input); } catch { fail("DATE_INVALID", row); }
    return input;
  }
  function text(value, maxLength, row, optional = false) {
    if ((value === undefined || value === null || value === "") && optional) return "";
    if (typeof value !== "string" || !value.trim() || value.length > maxLength) fail("FIELD_INVALID", row);
    return value.trim();
  }
  function driveImage(value, row) {
    const link = text(value, 2000, row, true);
    if (!link) return null;
    if (link.split(/[\s,]+/u).filter(Boolean).length !== 1) fail("IMAGE_COUNT", row);
    let url;
    try { url = new URL(link); } catch { fail("IMAGE_LINK", row); }
    if (url.protocol !== "https:" || url.hostname !== "drive.google.com" || url.username || url.password || url.port || url.hash) fail("IMAGE_LINK", row);
    const match = url.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]+)(?:\/view)?\/?$/);
    const id = match?.[1] || (url.pathname === "/open" && url.searchParams.get("id"));
    if (!identifier(id) || url.searchParams.getAll("id").length > 1) fail("IMAGE_LINK", row);
    const resourceKey = url.searchParams.get("resourcekey") || "";
    if (resourceKey && !/^[a-zA-Z0-9_-]{1,200}$/.test(resourceKey)) fail("IMAGE_LINK", row);
    return { id, resourceKey };
  }
  function parseRows(values, config, now) {
    if (!Array.isArray(values) || !Array.isArray(values[0]) || values.length > 1001) fail("SHEET_SIZE");
    const first = values[0].map(value => typeof value === "string" ? value.trim() : "");
    const indices = {};
    for (const [field, label] of Object.entries(config.columns)) {
      const matches = first.flatMap((header, index) => header === label ? [index] : []);
      if (matches.length > 1 || ((required.includes(field) || config.overrides.includes(field)) && matches.length !== 1)) fail("SHEET_HEADERS");
      indices[field] = matches[0] ?? -1;
    }
    const ids = new Set(), records = [], rows = [];
    for (let index = 1; index < values.length; index++) {
      const cells = values[index];
      if (!Array.isArray(cells)) fail("SHEET_ROW", index + 1);
      const get = field => cells[indices[field]] ?? "";
      if (Object.keys(headers).every(field => get(field) === "")) continue;
      const row = index + 1;
      const status = get("status") || "下書き";
      if (!["下書き", "公開", "公開終了"].includes(status)) fail("STATUS_INVALID", row);
      const id = get("id");
      if (!id && status === "下書き") continue;
      if (typeof id !== "string" || !/^[a-z0-9-]{1,100}$/.test(id) || ids.has(id)) fail("ID_INVALID", row);
      ids.add(id);
      rows.push({ id, state: status === "公開" ? "公開待ち" : status });
      if (status !== "公開") continue;
      const publishedAt = date(get("publishedAt"), row);
      if (Date.parse(publishedAt) > now) continue;
      const title = text(get("title"), 200, row);
      const category = categoryCodes[get("category")];
      if (!category) fail("CATEGORY_INVALID", row);
      const body = text(get("body"), 20000, row);
      const paragraphs = body.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      const item = {
        id, category, title, publishedAt,
        startsAt: get("startsAt") === "" ? null : date(get("startsAt"), row),
        medium: get("category"), summary: paragraphs[0].slice(0, 160), paragraphs
      };
      const url = text(get("url"), 2000, row, true);
      if (url) {
        let parsed;
        try { parsed = new URL(url); } catch { fail("LINK_INVALID", row); }
        if (parsed.protocol !== "https:" || parsed.username || parsed.password || /(^|\.)google\.com$/i.test(parsed.hostname)) fail("LINK_INVALID", row);
        item.url = url;
      }
      const image = driveImage(get("image"), row);
      if (image) item.imageAlt = text(get("imageAlt"), 300, row);
      const publicText = JSON.stringify(item);
      if ([config.spreadsheetId, config.driveFolderId, config.account?.client_email, image?.id].filter(Boolean).some(value => publicText.includes(value)) ||
          /docs\.google\.com\/spreadsheets|drive\.google\.com/i.test(publicText)) fail("PRIVATE_REFERENCE", row);
      records.push({ item, image, row });
      rows[rows.length - 1].state = "公開済み";
    }
    return { records, rows };
  }
  function parsePublication(payload, config, now) {
    if (!payload || payload.version !== 1 || payload.source !== config.namespace ||
        !Array.isArray(payload.records) || payload.records.length > 1000 ||
        Object.keys(payload).some(key => !["version", "source", "records", "batch"].includes(key)) ||
        typeof payload.batch !== "string" || !/^[a-z0-9-]{20,100}$/.test(payload.batch)) fail("PUBLISH_PAYLOAD");
    const allowed = ["id", "status", "publishedAt", "title", "category", "body", "startsAt", "url", "imageAlt", "imageKey", "sourceRow"];
    const values = [Object.values(headers)];
    for (let index = 0; index < payload.records.length; index++) {
      const record = payload.records[index], row = index + 2;
      if (!record || typeof record !== "object" || Array.isArray(record) ||
          Object.keys(record).some(key => !allowed.includes(key)) || record.status !== "公開" ||
          (record.sourceRow !== undefined && (!Number.isInteger(record.sourceRow) || record.sourceRow < 2 || record.sourceRow > 1000000))) fail("PUBLISH_RECORD", row);
      if (record.imageKey !== undefined && !/^[a-f0-9]{64}\.(?:jpg|png|webp)$/.test(record.imageKey)) fail("IMAGE_KEY", row);
      if (record.imageKey) text(record.imageAlt, 300, row);
      values.push(Object.keys(headers).map(field => field === "image" || field === "imageAlt" ? "" :
        field === "body" ? record.body : record[field] ?? ""));
    }
    const parsed = parseRows(values, config, now);
    const originals = new Map(payload.records.map(record => [record.id, record]));
    for (const record of parsed.records) {
      const original = originals.get(record.item.id);
      if (original.imageKey) {
        record.imageKey = original.imageKey;
        record.item.imageAlt = original.imageAlt;
        if (/docs\.google\.com\/spreadsheets|drive\.google\.com/i.test(original.imageAlt)) fail("PRIVATE_REFERENCE", record.row);
      }
    }
    return parsed;
  }
  return Object.freeze({ headers, SourceError, fail, readConfig, date, driveImage, parseRows, parsePublication });
})();

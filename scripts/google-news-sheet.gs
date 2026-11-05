/** @OnlyCurrentDoc */

const NEWS_MANAGEMENT_HEADERS = ["記事ID", "公開状態", "最終反映日時", "反映結果"];
const NEWS_INPUT_HEADERS = ["掲載日時", "タイトル", "カテゴリ", "本文", "出演・開催日時", "外部リンク", "画像URL", "画像の説明"];

function prepareNewsSheet() {
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getMaxRows() < 2) sheet.insertRowsAfter(1, 1);
  if (!sheet.getLastRow()) sheet.appendRow(NEWS_INPUT_HEADERS);
  let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  for (const name of NEWS_MANAGEMENT_HEADERS) {
    if (!headers.includes(name)) {
      sheet.getRange(1, headers.length + 1).setValue(name);
      headers.push(name);
    }
  }
  for (const name of NEWS_MANAGEMENT_HEADERS) {
    if (headers.filter(value => value === name).length !== 1) throw new Error("管理列の名前が重複しています。");
  }
  sheet.setFrozenRows(1);
  SpreadsheetApp.getActive().setSpreadsheetTimeZone("Asia/Tokyo");
  sheet.getRange(2, headers.indexOf("公開状態") + 1, sheet.getMaxRows() - 1, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["下書き", "公開", "公開終了"], true).setAllowInvalid(false).build());
  const category = headers.indexOf("カテゴリ");
  if (category >= 0) {
    sheet.getRange(2, category + 1, sheet.getMaxRows() - 1, 1)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["メディア", "イベント", "お知らせ"], true).setAllowInvalid(false).build());
  }
  for (const name of ["掲載日時", "出演・開催日時"]) {
    const column = headers.indexOf(name);
    if (column >= 0) {
      const range = sheet.getRange(2, column + 1, sheet.getMaxRows() - 1, 1);
      range.setNumberFormat(name === "掲載日時" ? "yyyy/mm/dd" : "yyyy/mm/dd hh:mm");
      if (name === "掲載日時") {
        range.setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
      }
    }
  }
  for (const name of ["記事ID", "最終反映日時", "反映結果"]) {
    const range = sheet.getRange(2, headers.indexOf(name) + 1, sheet.getMaxRows() - 1, 1);
    const existing = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).find(item => item.getDescription() === "ニュース管理：" + name);
    const protection = existing || range.protect().setDescription("ニュース管理：" + name);
    protection.setRange(range);
    const owner = Session.getEffectiveUser();
    protection.addEditor(owner);
    const others = protection.getEditors().filter(user => user.getEmail() !== owner.getEmail());
    if (others.length) protection.removeEditors(others);
    if (protection.canDomainEdit()) protection.setDomainEdit(false);
  }
  fillNewsIds_(sheet);
}

function enableNewsIdAutomation() {
  const sheet = SpreadsheetApp.getActiveSheet();
  prepareNewsSheet();
  PropertiesService.getScriptProperties().setProperty("NEWS_WORKSHEET", sheet.getName());
  installNewsIdTriggers_();
}

function installNewsIdTriggers_() {
  const book = SpreadsheetApp.getActive();
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === "handleNewsEdit") ScriptApp.deleteTrigger(trigger);
  }
  ScriptApp.newTrigger("handleNewsEdit").forSpreadsheet(book).onEdit().create();
  ScriptApp.newTrigger("handleNewsEdit").forSpreadsheet(book).onFormSubmit().create();
}

function installNewsTriggers() {
  const book = SpreadsheetApp.getActive();
  const mode = PropertiesService.getScriptProperties().getProperty("NEWS_MODE") || "pull";
  if (!["pull", "push"].includes(mode)) throw new Error("ニュースの連携方式を確認してください。");
  const handlers = ["updateNewsResults", "publishNews"];
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (handlers.includes(trigger.getHandlerFunction())) ScriptApp.deleteTrigger(trigger);
  }
  installNewsIdTriggers_();
  ScriptApp.newTrigger(mode === "push" ? "publishNews" : "updateNewsResults").timeBased().everyMinutes(5).create();
}

function configureNewsPublisher() {
  configureNewsPublisher_(false);
}

function setupNewsTest() {
  const book = SpreadsheetApp.getActive(), sheet = SpreadsheetApp.getActiveSheet(), ui = SpreadsheetApp.getUi();
  if (book.getName() !== "RKHP News Test" || sheet.getLastRow() > 1) {
    throw new Error("空のRKHP News Testだけを対象にしてください。既存の記事は上書きしません。");
  }
  if (ui.alert("テスト用の初期設定", "架空ニュース3件を公開対象で登録します。実際の出演情報は入れません。続けますか？", ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  configureNewsPublisher_(true);
}

function configureNewsPublisher_(seed) {
  const ui = SpreadsheetApp.getUi(), properties = PropertiesService.getScriptProperties();
  const origin = ui.prompt("ニュースAPI", "https:// から始まるWorkerのオリジンを入力してください。末尾の / は不要です。", ui.ButtonSet.OK_CANCEL);
  if (origin.getSelectedButton() !== ui.Button.OK) return;
  const namespace = ui.prompt("連携元の識別子", "案内されたNEWS_SOURCE_NAMESPACEを入力してください。シートURLではありません。", ui.ButtonSet.OK_CANCEL);
  if (namespace.getSelectedButton() !== ui.Button.OK) return;
  const token = ui.prompt("公開用の連携トークン", "ローカルのコピー用コマンドで取得したトークンを貼り付けてください。チャットには送らないでください。", ui.ButtonSet.OK_CANCEL);
  if (token.getSelectedButton() !== ui.Button.OK) return;
  const values = {
    NEWS_MODE: "push", NEWS_API_ORIGIN: origin.getResponseText().trim(),
    NEWS_SOURCE_NAMESPACE: namespace.getResponseText().trim(), NEWS_PUBLISH_TOKEN: token.getResponseText().trim(),
    NEWS_WORKSHEET: SpreadsheetApp.getActiveSheet().getName()
  };
  newsPublisherConfig_(values);
  properties.setProperties(values);
  prepareNewsSheet();
  if (seed) {
    const sheet = SpreadsheetApp.getActiveSheet(), headers = sheet.getDataRange().getDisplayValues()[0];
    const examples = [
      { "掲載日時": "2026/11/04", "タイトル": "テスト記事：新しい日付", "カテゴリ": "お知らせ" },
      { "掲載日時": "2026/10/20", "タイトル": "テスト記事：古い日付", "カテゴリ": "メディア" },
      { "掲載日時": "2026/11/02", "タイトル": "テスト記事：中間の日付", "カテゴリ": "イベント" }
    ];
    sheet.getRange(2, 1, examples.length, headers.length).setValues(examples.map(example =>
      headers.map(header => header === "本文" ? "表示順を確認する架空データです。実際の出演情報ではありません。" :
        header === "公開状態" ? "公開" : example[header] || "")));
    fillNewsIds_(sheet);
  }
  publishNews();
  installNewsTriggers();
}

function newsPublisherConfig_(properties) {
  if (!/^https:\/\/[a-zA-Z0-9.-]+$/.test(properties.NEWS_API_ORIGIN || "") ||
      !/^[a-z0-9-]{10,100}$/.test(properties.NEWS_SOURCE_NAMESPACE || "") ||
      !/^[A-Za-z0-9_-]{32,200}$/.test(properties.NEWS_PUBLISH_TOKEN || "") ||
      !properties.NEWS_WORKSHEET) throw newsError_("PUBLISH_CONFIG");
  return properties;
}

function newsError_(code, row) {
  const error = new Error(code);
  error.newsCode = code;
  if (Number.isInteger(row)) error.newsRow = row;
  return error;
}

function newsDate_(value, row, publication = false) {
  let result;
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    result = Utilities.formatDate(value, "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ss") + "+09:00";
  } else {
    const input = typeof value === "string" ? value.trim() : "";
    const match = input.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    result = match ? match[1] + "-" + match[2].padStart(2, "0") + "-" + match[3].padStart(2, "0") +
      "T" + (match[4] || "0").padStart(2, "0") + ":" + (match[5] || "00") + ":" + (match[6] || "00") + "+09:00" : input;
  }
  const parts = result.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!parts || !Number.isFinite(Date.parse(result)) || Number(parts[2]) < 1 || Number(parts[2]) > 12 ||
      Number(parts[3]) < 1 || Number(parts[3]) > new Date(Date.UTC(Number(parts[1]), Number(parts[2]), 0)).getUTCDate() ||
      Number(parts[4]) > 23 || Number(parts[5]) > 59 || Number(parts[6]) > 59) throw newsError_("DATE_INVALID", row);
  return publication ? Utilities.formatDate(new Date(result), "Asia/Tokyo", "yyyy-MM-dd") + "T00:00:00+09:00" : result;
}

function newsPublisherRows_(values, properties, now) {
  if (!Array.isArray(values) || !values.length || values.length > 1001) throw newsError_("SHEET_SIZE");
  const defaults = { id: "記事ID", status: "公開状態", publishedAt: "掲載日時", title: "タイトル", category: "カテゴリ",
    body: "本文", startsAt: "出演・開催日時", url: "外部リンク", image: "画像URL", imageAlt: "画像の説明" };
  let overrides;
  try { overrides = JSON.parse(properties.NEWS_COLUMNS || "{}"); } catch { throw newsError_("SHEET_HEADERS"); }
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides) ||
      Object.keys(overrides).some(key => !Object.prototype.hasOwnProperty.call(defaults, key))) throw newsError_("SHEET_HEADERS");
  const columns = Object.assign({}, defaults, overrides), indices = {}, names = Object.keys(columns).map(key => columns[key]);
  if (names.some(name => typeof name !== "string" || !name.trim()) || new Set(names).size !== names.length) throw newsError_("SHEET_HEADERS");
  const headers = values[0].map(value => String(value).trim());
  for (const key of Object.keys(columns)) {
    const matches = headers.map((header, index) => header === columns[key] ? index : -1).filter(index => index >= 0);
    if (matches.length > 1 || ((["id", "status", "publishedAt", "title", "category", "body"].includes(key) ||
        Object.prototype.hasOwnProperty.call(overrides, key)) && !matches.length)) throw newsError_("SHEET_HEADERS");
    indices[key] = matches.length ? matches[0] : -1;
  }
  const records = [], states = new Map(), ids = new Set();
  for (let index = 1; index < values.length; index++) {
    const get = key => values[index][indices[key]] === undefined || values[index][indices[key]] === null ? "" : values[index][indices[key]];
    if (Object.keys(columns).every(key => get(key) === "")) continue;
    const row = index + 1, id = get("id"), status = get("status") || "下書き";
    if (!["下書き", "公開", "公開終了"].includes(status)) throw newsError_("STATUS_INVALID", row);
    if (!id && status === "下書き") continue;
    if (typeof id !== "string" || !/^[a-z0-9-]{1,100}$/.test(id) || ids.has(id)) throw newsError_("ID_INVALID", row);
    ids.add(id); states.set(id, status);
    if (status !== "公開") continue;
    const publishedAt = newsDate_(get("publishedAt"), row, true);
    if (Date.parse(publishedAt) > now) { states.set(id, "公開待ち"); continue; }
    const record = { id, status: "公開", publishedAt, title: get("title"), category: get("category"), body: get("body"),
      startsAt: get("startsAt") === "" ? "" : newsDate_(get("startsAt"), row), url: get("url"), sourceRow: row };
    if (typeof record.title !== "string" || !record.title.trim() || record.title.length > 200 ||
        typeof record.body !== "string" || !record.body.trim() || record.body.length > 20000 ||
        !["メディア", "イベント", "お知らせ"].includes(record.category) ||
        (record.url && (typeof record.url !== "string" || !/^https:\/\/[^@\s]+$/.test(record.url)))) throw newsError_("FIELD_INVALID", row);
    if (/docs\.google\.com\/spreadsheets|drive\.google\.com/i.test(JSON.stringify(record))) throw newsError_("PRIVATE_REFERENCE", row);
    const image = get("image"), imageAlt = get("imageAlt");
    if (image && (typeof image !== "string" || typeof imageAlt !== "string" || !imageAlt.trim() || imageAlt.length > 300)) throw newsError_("IMAGE_LINK", row);
    if (image && /docs\.google\.com\/spreadsheets|drive\.google\.com/i.test(imageAlt)) throw newsError_("PRIVATE_REFERENCE", row);
    records.push({ record, image, imageAlt });
    states.set(id, "公開済み");
  }
  return { records, states };
}

function newsRequest_(properties, path, method, payload, contentType, batch) {
  const options = { method, headers: { Authorization: "Bearer " + properties.NEWS_PUBLISH_TOKEN },
    muteHttpExceptions: true, followRedirects: false };
  if (batch) options.headers["X-News-Batch"] = batch;
  if (payload !== undefined) {
    options.contentType = contentType || "application/json";
    options.payload = contentType ? payload : JSON.stringify(payload);
  }
  return UrlFetchApp.fetch(properties.NEWS_API_ORIGIN + path, options);
}

function newsImage_(entry, properties, batch, cache) {
  const match = entry.image.trim().match(/^https:\/\/drive\.google\.com\/(?:file\/d\/([A-Za-z0-9_-]{10,200})(?:\/view)?(?:\?[^,\s]*)?|open\?id=([A-Za-z0-9_-]{10,200})(?:&[^,\s]*)?)$/);
  if (!match) throw newsError_("IMAGE_LINK", entry.record.sourceRow);
  const id = match[1] || match[2], folderId = properties.NEWS_UPLOAD_FOLDER_ID;
  if (!folderId || !/^[A-Za-z0-9_-]{10,200}$/.test(folderId)) throw newsError_("IMAGE_FOLDER_REQUIRED", entry.record.sourceRow);
  if (cache.has(id)) return cache.get(id);
  let file;
  try { file = DriveApp.getFileById(id); } catch { throw newsError_("IMAGE_ACCESS", entry.record.sourceRow); }
  let folders = file.getParents(), pending = [], allowed = false;
  while (folders.hasNext()) pending.push(folders.next());
  const visited = new Set();
  for (let depth = 0; pending.length && depth < 10; depth++) {
    const next = [];
    for (const folder of pending) {
      if (folder.getId() === folderId) { allowed = true; break; }
      if (visited.has(folder.getId())) continue;
      visited.add(folder.getId());
      const parents = folder.getParents();
      while (parents.hasNext()) next.push(parents.next());
    }
    if (allowed) break;
    pending = next;
  }
  const mime = file.getMimeType(), size = file.getSize();
  if (!allowed) throw newsError_("IMAGE_FOLDER", entry.record.sourceRow);
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime) || size <= 0 || size > 10 * 1024 * 1024) throw newsError_("IMAGE_FILE", entry.record.sourceRow);
  const store = PropertiesService.getScriptProperties(), version = file.getLastUpdated().getTime() + ":" + size;
  const property = "NEWS_IMAGE_" + id;
  let cached;
  try { cached = JSON.parse(store.getProperty(property) || "null"); } catch { throw newsError_("IMAGE_CACHE", entry.record.sourceRow); }
  if (cached && cached.version === version && /^[a-f0-9]{64}\.(jpg|png|webp)$/.test(cached.key)) {
    const check = newsRequest_(properties, "/internal/images/" + cached.key, "head", undefined, undefined, batch);
    if (check.getResponseCode() === 200) { cache.set(id, cached.key); return cached.key; }
    if (check.getResponseCode() !== 404) throw newsError_("IMAGE_UPLOAD", entry.record.sourceRow);
  }
  const response = newsRequest_(properties, "/internal/images", "post", file.getBlob(), mime, batch);
  if (response.getResponseCode() !== 200) throw newsError_("IMAGE_UPLOAD", entry.record.sourceRow);
  const result = JSON.parse(response.getContentText());
  if (!/^[a-f0-9]{64}\.(jpg|png|webp)$/.test(result.key)) throw newsError_("IMAGE_UPLOAD", entry.record.sourceRow);
  store.setProperty(property, JSON.stringify({ version, key: result.key }));
  cache.set(id, result.key);
  return result.key;
}

function newsWriteFeedback_(sheet, states, updatedAt, failure) {
  const values = sheet.getDataRange().getDisplayValues(), headers = values[0];
  const id = headers.indexOf("記事ID"), time = headers.indexOf("最終反映日時"), result = headers.indexOf("反映結果");
  if ([id, time, result].includes(-1)) throw newsError_("SHEET_HEADERS");
  for (let index = 1; index < values.length; index++) {
    if (!values[index][id]) continue;
    const message = failure ? "反映停止：" + failure.code + (failure.row ? "（行" + failure.row + "）" : "") : states.get(values[index][id]);
    if (message) {
      sheet.getRange(index + 1, time + 1).setValue(updatedAt);
      sheet.getRange(index + 1, result + 1).setValue(message);
    }
  }
}

function publishNews() {
  const store = PropertiesService.getScriptProperties();
  const properties = newsPublisherConfig_(store.getProperties());
  const book = SpreadsheetApp.getActive(), sheet = book.getSheetByName(properties.NEWS_WORKSHEET);
  if (!sheet || book.getSpreadsheetTimeZone() !== "Asia/Tokyo") throw newsError_("SHEET_SETTINGS");
  fillNewsIds_(sheet);
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const context = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
      properties.NEWS_API_ORIGIN + ":" + properties.NEWS_SOURCE_NAMESPACE + ":" + properties.NEWS_PUBLISH_TOKEN));
    if (store.getProperty("NEWS_CACHE_CONTEXT") !== context) {
      for (const key of Object.keys(store.getProperties())) if (key.indexOf("NEWS_IMAGE_") === 0) store.deleteProperty(key);
      store.setProperty("NEWS_CACHE_CONTEXT", context);
    }
    const parsed = newsPublisherRows_(sheet.getDataRange().getValues(), properties, Date.now());
    const batch = Utilities.getUuid(), cache = new Map();
    for (const entry of parsed.records) {
      if (entry.image) { entry.record.imageKey = newsImage_(entry, properties, batch, cache); entry.record.imageAlt = entry.imageAlt; }
    }
    const response = newsRequest_(properties, "/internal/publish", "post", {
      version: 1, source: properties.NEWS_SOURCE_NAMESPACE, batch, records: parsed.records.map(entry => entry.record)
    });
    if (response.getResponseCode() !== 200) throw newsError_("WORKER_REJECTED");
    const result = JSON.parse(response.getContentText());
    if (typeof result.updatedAt !== "string" || typeof result.count !== "number") throw newsError_("WORKER_RESPONSE");
    newsWriteFeedback_(sheet, parsed.states, result.updatedAt);
    return { count: result.count, updatedAt: result.updatedAt };
  } catch (error) {
    const failure = { code: /^[A-Z_]{1,60}$/.test(error.newsCode || "") ? error.newsCode : "PUBLISH_FAILED",
      ...(Number.isInteger(error.newsRow) ? { row: error.newsRow } : {}) };
    try {
      const report = newsRequest_(properties, "/internal/report", "post", { source: properties.NEWS_SOURCE_NAMESPACE, ...failure });
      if (report.getResponseCode() !== 200) console.error("NEWS_REPORT_FAILED");
    }
    catch { console.error("NEWS_REPORT_FAILED"); }
    newsWriteFeedback_(sheet, new Map(), new Date().toISOString(), failure);
    throw new Error("ニュース反映停止：" + failure.code + (failure.row ? "（行" + failure.row + "）" : ""));
  } finally { lock.releaseLock(); }
}

function handleNewsEdit(event) {
  if (!event || !event.range) throw new Error("編集またはフォーム送信トリガーから実行してください。");
  const worksheet = PropertiesService.getScriptProperties().getProperty("NEWS_WORKSHEET");
  if (!worksheet) throw new Error("管理対象のタブを先に設定してください。");
  const sheet = event.range.getSheet();
  if (sheet.getName() !== worksheet) return;
  fillNewsIds_(sheet);
}

function fillNewsIds_(sheet) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const values = sheet.getDataRange().getDisplayValues();
    const headers = values[0];
    const column = headers.indexOf("記事ID");
    if (column < 0) throw new Error("prepareNewsSheetを先に実行してください。");
    for (let row = 1; row < values.length; row++) {
      if (!values[row][column] && values[row].some((value, index) => value && !NEWS_MANAGEMENT_HEADERS.includes(headers[index]))) {
        sheet.getRange(row + 1, column + 1).setValue("news-" + Utilities.getUuid());
      }
    }
  } finally {
    lock.releaseLock();
  }
}

function updateNewsResults() {
  const properties = PropertiesService.getScriptProperties();
  const url = properties.getProperty("NEWS_STATUS_URL");
  const token = properties.getProperty("NEWS_STATUS_TOKEN");
  const tab = properties.getProperty("NEWS_WORKSHEET");
  if (!url || !/^https:\/\/[^/?#]+\/internal\/status$/.test(url) || !token || !tab) {
    throw new Error("ステータスURL・トークン・タブ名をスクリプトプロパティに設定してください。");
  }
  const response = UrlFetchApp.fetch(url, { headers: { Authorization: "Bearer " + token }, muteHttpExceptions: true, followRedirects: false });
  if (response.getResponseCode() !== 200) throw new Error("反映結果を取得できません。認証と接続を確認してください。");
  const result = JSON.parse(response.getContentText());
  if (!Array.isArray(result.rows) || typeof result.updatedAt !== "string") throw new Error("反映結果の形式が正しくありません。");
  const sheet = SpreadsheetApp.getActive().getSheetByName(tab);
  if (!sheet) throw new Error("管理対象のタブが見つかりません。");
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0];
  const id = headers.indexOf("記事ID"), time = headers.indexOf("最終反映日時"), feedback = headers.indexOf("反映結果");
  if ([id, time, feedback].includes(-1)) throw new Error("管理列が不足しています。");
  const states = new Map(result.rows.map(row => [row.id, row.state]));
  for (let row = 1; row < values.length; row++) {
    if (!values[row][id]) continue;
    const message = result.error
      ? "反映停止：" + result.error.code + (result.error.row ? "（行" + result.error.row + "）" : "")
      : states.get(values[row][id]);
    if (message) {
      sheet.getRange(row + 1, time + 1).setValue(result.updatedAt);
      sheet.getRange(row + 1, feedback + 1).setValue(message);
    }
  }
}

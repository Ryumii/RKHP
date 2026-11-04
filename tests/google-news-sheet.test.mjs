import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import test from "node:test";

const source = readFileSync(fileURLToPath(new URL("../scripts/google-news-sheet.gs", import.meta.url)), "utf8");

function fixture(data = []) {
  const state = {
    data: data.map(row => [...row]), protections: [], held: false, created: [], deleted: [], fetches: [],
    validations: new Map(), formats: new Map(), prompts: [], confirmation: "yes",
    properties: {
      NEWS_STATUS_URL: "https://news-test.example.com/internal/status",
      NEWS_STATUS_TOKEN: "test-only-status-token",
      NEWS_WORKSHEET: "回答"
    },
    response: { updatedAt: "2026-11-04T01:00:00.000Z", rows: [], error: null },
    responseStatus: 200, logs: [], driveRequests: [], blobReads: 0
  };
  const owner = { getEmail: () => "owner@example.com" };
  const sheet = {
    getName: () => "回答",
    getMaxRows: () => 100,
    getLastRow: () => state.data.length,
    getLastColumn: () => Math.max(0, ...state.data.map(row => row.length)),
    appendRow(row) { state.data.push(Array.from(row)); },
    setFrozenRows(count) { state.frozen = count; },
    getProtections: () => state.protections,
    getDataRange() { return this.getRange(1, 1, state.data.length, this.getLastColumn()); },
    getRange(row, column, height = 1, width = 1) {
      const range = {
        getSheet: () => sheet,
        getDisplayValues: () => Array.from({ length: height }, (_, offset) =>
          Array.from({ length: width }, (_, index) => String(state.data[row + offset - 1]?.[column + index - 1] ?? ""))),
        getValues: () => Array.from({ length: height }, (_, offset) =>
          Array.from({ length: width }, (_, index) => state.data[row + offset - 1]?.[column + index - 1] ?? "")),
        setValue(value) { state.data[row - 1] ||= []; state.data[row - 1][column - 1] = value; return this; },
        setValues(values) { values.forEach((items, offset) => { state.data[row + offset - 1] ||= []; items.forEach((value, index) => { state.data[row + offset - 1][column + index - 1] = value; }); }); return this; },
        setDataValidation(value) { state.validations.set(column, value); return this; },
        setNumberFormat(value) { state.formats.set(column, value); return this; },
        protect() {
          const protection = {
            editors: [{ getEmail: () => "other@example.com" }], domain: true,
            setDescription(value) { this.description = value; return this; },
            getDescription() { return this.description; },
            setRange(value) { this.range = value; return this; },
            addEditor(value) { this.editors.push(value); },
            getEditors() { return this.editors; },
            removeEditors(users) { this.editors = this.editors.filter(user => !users.includes(user)); },
            canDomainEdit() { return this.domain; },
            setDomainEdit(value) { this.domain = value; }
          };
          state.protections.push(protection);
          return protection;
        }
      };
      return range;
    }
  };
  const book = { getName: () => state.bookName || "RKHP News Test", getSpreadsheetTimeZone: () => state.timezone || "Asia/Tokyo",
    setSpreadsheetTimeZone(value) { state.timezone = value; }, getSheetByName: name => name === "回答" ? sheet : null };
  const ui = {
    Button: { OK: "ok", YES: "yes" }, ButtonSet: { OK_CANCEL: "ok-cancel", YES_NO: "yes-no" },
    alert: () => state.confirmation,
    prompt() {
      const answer = state.prompts.shift() || { button: "cancel" };
      return { getSelectedButton: () => answer.button || "ok", getResponseText: () => answer.text || "" };
    }
  };
  const context = createContext({
    SpreadsheetApp: {
      getActiveSheet: () => sheet, getActive: () => book, getUi: () => ui, ProtectionType: { RANGE: "range" },
      newDataValidation() {
        return { requireValueInList(values) { this.values = Array.from(values); return this; }, setAllowInvalid(value) { this.allowInvalid = value; return this; }, build() { return this; } };
      }
    },
    Session: { getEffectiveUser: () => owner },
    Utilities: {
      getUuid: randomUUID, DigestAlgorithm: { SHA_256: "SHA-256" },
      computeDigest: (_, value) => [...createHash("sha256").update(value).digest()],
      base64EncodeWebSafe: bytes => Buffer.from(bytes).toString("base64url"),
      formatDate: value => new Date(value.getTime() + 9 * 3600000).toISOString().slice(0, 19)
    },
    LockService: { getDocumentLock: () => ({ waitLock() { state.held = true; }, releaseLock() { state.held = false; } }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => state.properties[key], getProperties: () => ({ ...state.properties }),
      setProperty(key, value) { state.properties[key] = value; },
      setProperties(values) { Object.assign(state.properties, values); },
      deleteProperty(key) { delete state.properties[key]; }
    }) },
    console: { error: message => state.logs.push(message) },
    DriveApp: { getFileById(id) { state.driveRequests.push(id); if (!state.driveFile) throw new Error("not available"); return state.driveFile; } },
    UrlFetchApp: { fetch(url, options) {
      state.fetches.push({ url, options });
      return { getResponseCode: () => state.responseStatus, getContentText: () => JSON.stringify(state.onFetch ? state.onFetch(url, options) : state.response) };
    } },
    ScriptApp: {
      getProjectTriggers: () => [{ getHandlerFunction: () => "otherTask" }, { getHandlerFunction: () => "handleNewsEdit" }],
      deleteTrigger(trigger) { state.deleted.push(trigger.getHandlerFunction()); },
      newTrigger(handler) {
        const entry = { handler };
        return {
          forSpreadsheet() { return this; },
          onEdit() { entry.type = "edit"; return this; },
          onFormSubmit() { entry.type = "submit"; return this; },
          timeBased() { return this; },
          everyMinutes(value) { entry.minutes = value; return this; },
          create() { state.created.push(entry); }
        };
      }
    }
  });
  runInContext(source, context);
  return { state, sheet, script: context };
}

test("sheet preparation preserves Form answers and protects only system fields", () => {
  const { state, script } = fixture([["タイムスタンプ", "メールアドレス", "ニュースのタイトル"], ["2026/11/04", "editor@example.com", "記事"]]);
  script.prepareNewsSheet();
  assert.deepEqual(state.data[0].slice(0, 3), ["タイムスタンプ", "メールアドレス", "ニュースのタイトル"]);
  assert.deepEqual(state.data[1].slice(0, 3), ["2026/11/04", "editor@example.com", "記事"]);
  const id = state.data[1][state.data[0].indexOf("記事ID")];
  assert.match(id, /^news-[a-f0-9-]{36}$/);
  assert.equal(state.timezone, "Asia/Tokyo");
  assert.equal(state.protections.length, 3);
  assert(state.protections.every(item => !item.domain && item.editors.every(editor => editor.getEmail() === "owner@example.com")));
  script.prepareNewsSheet();
  assert.equal(state.data[1][state.data[0].indexOf("記事ID")], id);
  assert.equal(state.protections.length, 3);
  assert.equal(state.held, false);
});

test("an empty test sheet receives the complete schema, category choices and date formats", () => {
  assert.match(source, /^\/\*\*\s*@OnlyCurrentDoc\s*\*\//);
  const { state, script } = fixture();
  script.prepareNewsSheet();
  const headers = state.data[0];
  assert.equal(headers.length, 12);
  assert.deepEqual(state.validations.get(headers.indexOf("カテゴリ") + 1).values, ["メディア", "イベント", "お知らせ"]);
  assert.equal(state.validations.get(headers.indexOf("カテゴリ") + 1).allowInvalid, false);
  assert.equal(state.formats.get(headers.indexOf("掲載日時") + 1), "yyyy/mm/dd hh:mm");
  assert.equal(state.timezone, "Asia/Tokyo");
});

test("editing and row movement retain IDs while new answers receive a different ID", () => {
  const { state, sheet, script } = fixture([["タイトル"], ["記事A"], ["記事B"]]);
  script.prepareNewsSheet();
  const column = state.data[0].indexOf("記事ID");
  const first = state.data[1][column], second = state.data[2][column];
  [state.data[1], state.data[2]] = [state.data[2], state.data[1]];
  state.data.push(["記事C"]);
  script.handleNewsEdit({ range: sheet.getRange(4, 1) });
  assert.equal(state.data[1][column], second);
  assert.equal(state.data[2][column], first);
  assert.notEqual(state.data[3][column], first);
  assert.notEqual(state.data[3][column], second);
  assert.equal(state.held, false);
});

test("feedback is keyed by ID and updates only the dedicated result columns", () => {
  const { state, script } = fixture([["タイトル"], ["記事A"]]);
  script.prepareNewsSheet();
  const headers = state.data[0], id = state.data[1][headers.indexOf("記事ID")];
  state.response.rows = [{ id, state: "公開済み" }];
  script.updateNewsResults();
  assert.equal(state.data[1][0], "記事A");
  assert.equal(state.data[1][headers.indexOf("反映結果")], "公開済み");
  assert.equal(state.data[1][headers.indexOf("最終反映日時")], state.response.updatedAt);
  assert.equal(state.fetches[0].options.followRedirects, false);
  assert.equal(state.fetches[0].options.headers.Authorization, "Bearer test-only-status-token");
});

test("failed status authentication surfaces a fixed error without writing answer cells", () => {
  const { state, script } = fixture([["タイトル"], ["記事A"]]);
  script.prepareNewsSheet();
  const before = JSON.stringify(state.data);
  state.responseStatus = 403;
  assert.throws(() => script.updateNewsResults(), /反映結果を取得できません/);
  assert.equal(JSON.stringify(state.data), before);
});

test("trigger setup preserves unrelated automation and installs both edit and Form triggers", () => {
  const { state, script } = fixture();
  script.installNewsTriggers();
  assert.deepEqual(state.deleted, ["handleNewsEdit"]);
  assert.deepEqual(state.created, [
    { handler: "handleNewsEdit", type: "edit" },
    { handler: "handleNewsEdit", type: "submit" },
    { handler: "updateNewsResults", minutes: 5 }
  ]);
});

function publisher() {
  const data = [
    ["記事ID", "公開状態", "掲載日時", "タイトル", "カテゴリ", "本文", "出演・開催日時", "外部リンク", "画像URL", "画像の説明", "メールアドレス", "内部メモ"],
    ["news-public", "公開", "2026/10/20 09:00", "公開する記事", "メディア", "公開本文", "", "", "", "", "private@example.com", "公開しないメモ"],
    ["news-draft", "下書き", "", "", "", "", "", "", "", "", "secret@example.com", "未解禁"],
    ["news-future", "公開", "2099/01/01", "未解禁記事", "イベント", "未来本文", "", "", "", "", "", ""]
  ];
  const fixtureState = fixture(data);
  Object.assign(fixtureState.state.properties, {
    NEWS_MODE: "push", NEWS_API_ORIGIN: "https://news-test.example.com",
    NEWS_SOURCE_NAMESPACE: "test-push-source-0001", NEWS_PUBLISH_TOKEN: "test-publisher-token-00000000000000000000000"
  });
  fixtureState.state.onFetch = (url, options) => url.endsWith("/internal/publish")
    ? { count: JSON.parse(options.payload).records.length, updatedAt: "2026-11-04T01:00:00.000Z" } : { reported: true };
  return fixtureState;
}

test("owner test setup seeds shuffled dates, publishes once and installs keyless triggers", () => {
  const { state, script } = fixture();
  state.prompts = [
    { text: "https://news-test.example.com" },
    { text: "test-push-source-0001" },
    { text: "test-publisher-token-00000000000000000000000" }
  ];
  state.onFetch = (_, options) => ({
    count: JSON.parse(options.payload).records.length, updatedAt: "2026-11-04T02:00:00.000Z"
  });
  runInContext('Date.now = () => Date.parse("2026-11-04T02:00:00Z")', script);
  script.setupNewsTest();
  assert.equal(state.timezone, "Asia/Tokyo");
  assert.equal(state.data[0].length, 12);
  assert.deepEqual(state.data.slice(1).map(row => row[0]), ["2026/11/04 10:00", "2026/10/20 09:00", "2026/11/02 12:00"]);
  const ids = state.data.slice(1).map(row => row[state.data[0].indexOf("記事ID")]);
  assert.equal(new Set(ids).size, 3);
  assert(ids.every(id => /^news-[a-f0-9-]{36}$/.test(id)));
  assert(state.data.slice(1).every(row => row[state.data[0].indexOf("反映結果")] === "公開済み"));
  assert.equal(state.fetches.length, 1);
  assert.equal(JSON.parse(state.fetches[0].options.payload).records.length, 3);
  assert.equal(state.properties.NEWS_MODE, "push");
  assert.equal(state.properties.NEWS_WORKSHEET, "回答");
  assert.deepEqual(state.created[2], { handler: "publishNews", minutes: 5 });
});

test("test seeding refuses other books and existing answers without changing them", () => {
  for (const existing of [false, true]) {
    const data = existing ? [["タイトル"], ["既存の記事"]] : [];
    const { state, script } = fixture(data);
    if (!existing) state.bookName = "Other News";
    assert.throws(() => script.setupNewsTest(), /空のRKHP News Test/);
    assert.deepEqual(state.data, data);
    assert.equal(state.fetches.length, 0);
    assert.equal(state.created.length, 0);
    assert.equal(state.properties.NEWS_MODE, undefined);
  }
});

test("canceling owner confirmation or any publisher prompt leaves the sheet and configuration intact", () => {
  const confirm = fixture();
  confirm.state.confirmation = "no";
  confirm.script.setupNewsTest();
  assert.deepEqual(confirm.state.data, []);
  assert.equal(confirm.state.properties.NEWS_MODE, undefined);
  for (let canceled = 0; canceled < 3; canceled++) {
    const data = [["タイトル"], ["既存の記事"]];
    const { state, script } = fixture(data);
    state.prompts = [
      { text: "https://news-test.example.com" },
      { text: "test-push-source-0001" },
      { text: "test-publisher-token-00000000000000000000000" }
    ].slice(0, canceled).concat({ button: "cancel" });
    script.configureNewsPublisher();
    assert.deepEqual(state.data, data);
    assert.equal(state.properties.NEWS_MODE, undefined);
    assert.equal(state.fetches.length, 0);
    assert.equal(state.created.length, 0);
  }
});

test("keyless publishing sends only published fields, never private columns or future content", () => {
  const { state, script } = publisher();
  script.prepareNewsSheet();
  const result = script.publishNews();
  assert.equal(result.count, 1);
  const request = state.fetches.find(entry => entry.url.endsWith("/internal/publish"));
  const payload = JSON.parse(request.options.payload);
  assert.equal(payload.records.length, 1);
  assert.equal(payload.records[0].id, "news-public");
  assert.equal(payload.records[0].publishedAt, "2026-10-20T09:00:00+09:00");
  for (const value of ["private@example.com", "内部メモ", "未解禁", "news-draft", "news-future"]) assert(!request.options.payload.includes(value));
  assert.equal(state.data[1][state.data[0].indexOf("反映結果")], "公開済み");
  assert.equal(state.data[2][state.data[0].indexOf("反映結果")], "下書き");
  assert.equal(state.data[3][state.data[0].indexOf("反映結果")], "公開待ち");
  assert.equal(state.held, false);
});

test("keyless trigger setup schedules the publisher, not legacy credential polling", () => {
  const { state, script } = publisher();
  script.installNewsTriggers();
  assert.deepEqual(state.created[2], { handler: "publishNews", minutes: 5 });
});

test("private source links are rejected in Google before publishing any records", () => {
  const { state, script } = publisher();
  state.data[1][5] = "https://docs.google.com/spreadsheets/d/private-source";
  script.prepareNewsSheet();
  assert.throws(() => script.publishNews(), /PRIVATE_REFERENCE/);
  assert(!state.fetches.some(entry => entry.url.endsWith("/internal/publish")));
  const report = JSON.parse(state.fetches[0].options.payload);
  assert.equal(report.code, "PRIVATE_REFERENCE");
  assert(!JSON.stringify(report).includes("private-source"));
  assert.equal(state.held, false);
});

test("publisher cache context resets only its own image cache on source switching", () => {
  const { state, script } = publisher();
  state.properties.NEWS_CACHE_CONTEXT = "old";
  state.properties.NEWS_IMAGE_oldFile = "cached";
  state.properties.UNRELATED_SETTING = "keep";
  script.prepareNewsSheet();
  script.publishNews();
  assert.equal(state.properties.NEWS_IMAGE_oldFile, undefined);
  assert.equal(state.properties.UNRELATED_SETTING, "keep");
});

test("a rejected keyless publish keeps input and surfaces a safe failure", () => {
  const { state, script } = publisher();
  state.responseStatus = 403;
  script.prepareNewsSheet();
  assert.throws(() => script.publishNews(), /WORKER_REJECTED/);
  assert.equal(state.data[1][5], "公開本文");
  assert(state.logs.includes("NEWS_REPORT_FAILED"));
  assert.equal(state.held, false);
});

function imagePublisher(allowed = true) {
  const result = publisher(), { state } = result;
  const iterator = values => ({ hasNext: () => values.length > 0, next: () => values.shift() });
  const root = { getId: () => "private-form-folder-0001", getParents: () => iterator([]) };
  const question = { getId: () => "private-question-folder-0001", getParents: () => iterator(allowed ? [root] : []) };
  const blob = { testBytes: [255, 216, 255, 224] };
  state.properties.NEWS_UPLOAD_FOLDER_ID = root.getId();
  state.data[1][8] = "https://drive.google.com/open?id=private-upload-image-0001";
  state.data[1][9] = "番組の画像";
  state.driveFile = {
    getParents: () => iterator([question]), getMimeType: () => "image/jpeg", getSize: () => 4,
    getLastUpdated: () => new Date("2026-11-04T00:00:00Z"),
    getBlob() { state.blobReads++; return blob; }
  };
  const previous = state.onFetch;
  state.onFetch = (url, options) => url.endsWith("/internal/images") ? { key: "a".repeat(64) + ".jpg" } : previous(url, options);
  return result;
}

test("Form uploads are read only inside the allowed folder and original links never leave Google", () => {
  const { state, script } = imagePublisher();
  script.prepareNewsSheet();
  script.publishNews();
  const upload = state.fetches.find(entry => entry.url.endsWith("/internal/images"));
  assert.equal(upload.options.contentType, "image/jpeg");
  assert.equal(upload.options.payload.testBytes[0], 255);
  const publication = JSON.parse(state.fetches.find(entry => entry.url.endsWith("/internal/publish")).options.payload);
  assert.equal(publication.records[0].imageKey, "a".repeat(64) + ".jpg");
  assert(!JSON.stringify(publication).includes("private-upload-image"));
  assert(!JSON.stringify(publication).includes("drive.google.com"));
  script.publishNews();
  assert.equal(state.blobReads, 1);
  assert(state.fetches.some(entry => entry.options.method === "head"));
});

test("images outside the Form folder are stopped before file content or publication is sent", () => {
  const { state, script } = imagePublisher(false);
  script.prepareNewsSheet();
  assert.throws(() => script.publishNews(), /IMAGE_FOLDER/);
  assert.equal(state.blobReads, 0);
  assert(!state.fetches.some(entry => entry.url.endsWith("/internal/images")));
  assert(!state.fetches.some(entry => entry.url.endsWith("/internal/publish")));
});

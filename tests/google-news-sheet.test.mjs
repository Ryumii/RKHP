import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import test from "node:test";

const source = readFileSync(fileURLToPath(new URL("../scripts/google-news-sheet.gs", import.meta.url)), "utf8");

function fixture(data = []) {
  const state = {
    data: data.map(row => [...row]), protections: [], held: false, created: [], deleted: [], fetches: [],
    validations: new Map(), formats: new Map(),
    properties: {
      NEWS_STATUS_URL: "https://news-test.example.com/internal/status",
      NEWS_STATUS_TOKEN: "test-only-status-token",
      NEWS_WORKSHEET: "回答"
    },
    response: { updatedAt: "2026-11-04T01:00:00.000Z", rows: [], error: null },
    responseStatus: 200
  };
  const owner = { getEmail: () => "owner@example.com" };
  const sheet = {
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
        setValue(value) { state.data[row - 1] ||= []; state.data[row - 1][column - 1] = value; return this; },
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
  const book = { setSpreadsheetTimeZone(value) { state.timezone = value; }, getSheetByName: name => name === "回答" ? sheet : null };
  const context = createContext({
    SpreadsheetApp: {
      getActiveSheet: () => sheet, getActive: () => book, ProtectionType: { RANGE: "range" },
      newDataValidation() {
        return { requireValueInList(values) { this.values = Array.from(values); return this; }, setAllowInvalid(value) { this.allowInvalid = value; return this; }, build() { return this; } };
      }
    },
    Session: { getEffectiveUser: () => owner },
    Utilities: { getUuid: randomUUID },
    LockService: { getDocumentLock: () => ({ waitLock() { state.held = true; }, releaseLock() { state.held = false; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => state.properties[key] }) },
    UrlFetchApp: { fetch(url, options) {
      state.fetches.push({ url, options });
      return { getResponseCode: () => state.responseStatus, getContentText: () => JSON.stringify(state.response) };
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

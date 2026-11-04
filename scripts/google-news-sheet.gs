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
    if (column >= 0) sheet.getRange(2, column + 1, sheet.getMaxRows() - 1, 1).setNumberFormat("yyyy/mm/dd hh:mm");
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

function installNewsTriggers() {
  const book = SpreadsheetApp.getActive();
  const handlers = ["handleNewsEdit", "updateNewsResults"];
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (handlers.includes(trigger.getHandlerFunction())) ScriptApp.deleteTrigger(trigger);
  }
  ScriptApp.newTrigger("handleNewsEdit").forSpreadsheet(book).onEdit().create();
  ScriptApp.newTrigger("handleNewsEdit").forSpreadsheet(book).onFormSubmit().create();
  ScriptApp.newTrigger("updateNewsResults").timeBased().everyMinutes(5).create();
}

function handleNewsEdit(event) {
  if (!event || !event.range) throw new Error("編集またはフォーム送信トリガーから実行してください。");
  fillNewsIds_(event.range.getSheet());
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

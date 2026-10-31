"use strict";

window.RKNews = (() => {
  const categories = Object.freeze({ all: "すべて", media: "メディア", event: "イベント", info: "お知らせ" });
  const regularCategories = Object.freeze({ all: "すべて", terrestrial: "地上波", internet: "ネット", radio: "ラジオ" });
  const datePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:Z|[+-]\d{2}:\d{2})$/;

  function isDate(value) {
    if (typeof value !== "string") return false;
    const parts = datePattern.exec(value);
    if (!parts) return false;
    const [, year, month, day, hour, minute, second] = parts.map(Number);
    const calendar = new Date(0);
    calendar.setUTCFullYear(year, month, 0);
    return month >= 1 && month <= 12 && day >= 1 && day <= calendar.getUTCDate() &&
      hour <= 23 && minute <= 59 && second <= 59 && Number.isFinite(Date.parse(value));
  }

  function validateHttpsUrl(value) {
    if (typeof value !== "string") throw new TypeError("URLは文字列で指定してください。");
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new TypeError("URLには認証情報を含まないHTTPSの絶対URLを指定してください。");
    }
  }

  function validateNews(items) {
    if (!Array.isArray(items)) throw new TypeError("ニュースのデータは配列で指定してください。");
    const ids = new Set();
    for (const item of items) {
      if (!item || typeof item !== "object") throw new TypeError("ニュースの形式が正しくありません。");
      if (typeof item.id !== "string" || !/^[a-z0-9-]+$/.test(item.id) || ids.has(item.id)) {
        throw new TypeError("記事IDが不正、または重複しています。");
      }
      ids.add(item.id);
      if (!Object.hasOwn(categories, item.category) || item.category === "all") throw new TypeError("記事カテゴリが不正です。");
      for (const key of ["title", "summary", "medium"]) {
        if (typeof item[key] !== "string" || !item[key].trim()) throw new TypeError(`記事の${key}が未設定です。`);
      }
      if (!isDate(item.publishedAt) || (item.startsAt !== null && !isDate(item.startsAt))) {
        throw new TypeError("記事の日時にはタイムゾーン付きの日時を指定してください。");
      }
      if (!Array.isArray(item.paragraphs) || !item.paragraphs.length ||
          item.paragraphs.some((text) => typeof text !== "string" || !text.trim())) {
        throw new TypeError("記事の本文が不正です。");
      }
      if (item.image !== undefined) {
        validateHttpsUrl(item.image);
        if (typeof item.imageAlt !== "string" || !item.imageAlt.trim()) {
          throw new TypeError("画像にはHTTPSのURLと代替テキストを指定してください。");
        }
      }
    }
    return items;
  }

  function selectNews(items, category = "all") {
    validateNews(items);
    if (!Object.hasOwn(categories, category)) throw new TypeError("絞り込みカテゴリが不正です。");
    return items.filter((item) => category === "all" || item.category === category)
      .toSorted((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id));
  }

  function validateRegularMedia(items) {
    if (!Array.isArray(items)) throw new TypeError("レギュラーメディアのデータは配列で指定してください。");
    const ids = new Set();
    for (const item of items) {
      if (!item || typeof item !== "object") throw new TypeError("レギュラーメディアの形式が正しくありません。");
      if (typeof item.id !== "string" || !/^[a-z0-9-]+$/.test(item.id) || ids.has(item.id)) {
        throw new TypeError("レギュラーメディアのIDが不正、または重複しています。");
      }
      ids.add(item.id);
      if (!Object.hasOwn(regularCategories, item.category) || item.category === "all") {
        throw new TypeError("レギュラーメディアのカテゴリが不正です。");
      }
      if (typeof item.title !== "string" || !item.title.trim()) throw new TypeError("番組タイトルが未設定です。");
      if (item.url != null && item.url !== "") validateHttpsUrl(item.url);
      if (typeof item.image !== "string" || !item.image.trim()) throw new TypeError("番組画像を指定してください。");
      if (!/^assets\/regular-media\/[\p{L}\p{N}_ \u3000-]+\.(?:png|jpe?g|webp)$/iu.test(item.image)) validateHttpsUrl(item.image);
      if (typeof item.imageAlt !== "string" || !item.imageAlt.trim()) throw new TypeError("番組画像の代替テキストを指定してください。");
    }
    return items;
  }

  function selectRegularMedia(items, category = "all") {
    validateRegularMedia(items);
    if (!Object.hasOwn(regularCategories, category)) throw new TypeError("レギュラーメディアの絞り込みカテゴリが不正です。");
    return items.filter((item) => category === "all" || item.category === category);
  }

  function formatDate(value, mode = "date") {
    if (!isDate(value)) throw new TypeError("表示する日時が不正です。");
    if (!["date", "event"].includes(mode)) throw new TypeError("日時の表示形式が不正です。");
    const options = mode === "event"
      ? { month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }
      : { year: "numeric", month: "2-digit", day: "2-digit" };
    return new Intl.DateTimeFormat("ja-JP", { ...options, timeZone: "Asia/Tokyo" }).format(new Date(value));
  }

  return Object.freeze({ categories, regularCategories, validateNews, selectNews, validateRegularMedia, selectRegularMedia, formatDate });
})();

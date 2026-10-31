"use strict";

window.RKContact = (() => {
  const keyPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

  function text(value, label, maxLength, optional = false) {
    if (optional && value == null) return "";
    if (typeof value !== "string") throw new TypeError(`${label}を入力してください。`);
    const result = value.trim();
    if (!optional && !result) throw new TypeError(`${label}を入力してください。`);
    if (result.length > maxLength) throw new TypeError(`${label}は${maxLength}文字以内で入力してください。`);
    return result;
  }

  function validateConfig(config) {
    if (!config || typeof config !== "object" || Array.isArray(config)) throw new TypeError("問い合わせの設定が正しくありません。");
    if (typeof config.accessKey !== "string") throw new TypeError("Web3FormsのAccess Keyを文字列で設定してください。");
    const accessKey = config.accessKey.trim();
    if (accessKey && !keyPattern.test(accessKey)) throw new TypeError("Web3FormsのAccess Keyの形式が正しくありません。");
    const fromName = text(config.fromName, "通知の差出人名", 80);
    const subject = text(config.subject, "問い合わせの件名", 160);
    if ([fromName, subject].some((value) => /[\r\n]/.test(value))) {
      throw new TypeError("通知の差出人名と件名に改行は使用できません。");
    }
    return { accessKey, fromName, subject };
  }

  function buildPayload(config, values) {
    const settings = validateConfig(config);
    if (!settings.accessKey) throw new TypeError("送信先の設定が完了していません。");
    if (!values || typeof values !== "object" || Array.isArray(values)) throw new TypeError("お問い合わせの入力内容が正しくありません。");
    const name = text(values.name, "お名前", 80);
    const company = text(values.company, "会社・媒体名", 120, true);
    const email = text(values.email, "メールアドレス", 254);
    const message = text(values.message, "ご相談内容", 5000);
    if ([name, company].some((value) => /[\r\n]/.test(value))) throw new TypeError("お名前と会社・媒体名に改行は使用できません。");
    if (!/^[^\s@,;?#]+@[^\s@,;?#]+\.[^\s@,;?#]+$/.test(email)) throw new TypeError("メールアドレスを確認してください。");
    if (values.consent !== "yes") throw new TypeError("情報の利用目的と外部送信について確認してください。");
    const captcha = text(values["h-captcha-response"], "送信確認（hCaptcha）", 8192);
    return {
      access_key: settings.accessKey,
      from_name: settings.fromName,
      subject: settings.subject,
      name,
      company,
      email,
      message,
      consent: "利用目的と外部送信を確認済み",
      "h-captcha-response": captcha
    };
  }

  function isSuccess(ok, result) {
    return Boolean(ok === true && result && typeof result === "object" && !Array.isArray(result) && result.success === true);
  }

  return Object.freeze({ validateConfig, buildPayload, isSuccess });
})();

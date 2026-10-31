"use strict";

(() => {
  const { validateNews, selectNews, validateRegularMedia, selectRegularMedia, formatDate } = window.RKNews;
  const { validateConfig, buildPayload, isSuccess } = window.RKContact;
  const data = window.RK_CONTENT.news;
  const regular = window.RK_CONTENT.regularMedia;
  let passed = 0;
  let failed = 0;
  function assert(value, message) {
    if (!value) throw new Error(message || "Assertion failed");
  }
  function throws(fn) {
    let thrown = false;
    try { fn(); } catch { thrown = true; }
    assert(thrown, "例外が発生しませんでした。");
  }
  function test(name, fn) {
    const item = document.createElement("li");
    try {
      fn();
      passed++;
      item.className = "pass";
      item.textContent = `PASS：${name}`;
    } catch (error) {
      failed++;
      item.className = "fail";
      item.textContent = `FAIL：${name}／${error.message}`;
      console.error(name, error);
    }
    document.querySelector("#tests").append(item);
  }
  function modified(change) {
    const copy = structuredClone(data);
    change(copy);
    return copy;
  }

  test("5件の公開サンプルを検証する", () => assert(validateNews(data).length === 5));
  test("全カテゴリは公開日の新しい順になる", () => assert(selectNews(data)[0].id === "sample-talk"));
  test("メディアだけを3件表示する", () => assert(selectNews(data, "media").length === 3));
  test("イベントだけを1件表示する", () => assert(selectNews(data, "event").length === 1));
  test("お知らせだけを1件表示する", () => assert(selectNews(data, "info").length === 1));
  test("並べ替えで元の配列を変更しない", () => {
    const ids = data.map((item) => item.id).join(",");
    selectNews(data, "media");
    assert(ids === data.map((item) => item.id).join(","));
  });
  test("時差を考慮して日本時間の日付を表示する", () => assert(formatDate("2026-10-28T15:00:00Z") === "2026/10/29"));
  test("タイムゾーンなしの日付を拒否する", () => throws(() => formatDate("2026-10-28")));
  test("実在しない2月30日を拒否する", () => throws(() => validateNews(modified((rows) => { rows[0].publishedAt = "2026-02-30T09:00:00+09:00"; }))));
  test("閏年の2月29日は受け付ける", () => {
    validateNews(modified((rows) => { rows[0].publishedAt = "2028-02-29T09:00:00+09:00"; }));
  });
  test("記事IDの重複を拒否する", () => throws(() => validateNews(modified((rows) => { rows[1].id = rows[0].id; }))));
  test("不明なカテゴリを拒否する", () => throws(() => selectNews(data, "unknown")));
  test("空のタイトルを拒否する", () => throws(() => validateNews(modified((rows) => { rows[0].title = " "; }))));
  test("不正な本文形式を拒否する", () => throws(() => validateNews(modified((rows) => { rows[0].paragraphs = [42]; }))));
  test("安全でない画像URLを拒否する", () => throws(() => validateNews(modified((rows) => { rows[0].image = "javascript:alert(1)"; }))));
  test("不明な日時表示形式を拒否する", () => throws(() => formatDate(data[0].publishedAt, "unknown")));

  test("提供されたレギュラーメディア5件を検証する", () => assert(validateRegularMedia(regular).length === 5));
  test("未登録の地上波は0件になる", () => assert(selectRegularMedia(regular, "terrestrial").length === 0));
  test("ネットを4件表示する", () => assert(selectRegularMedia(regular, "internet").length === 4));
  test("ラジオを1件表示する", () => assert(selectRegularMedia(regular, "radio").length === 1));
  test("指定された番組・分類・リンク・画像を順番どおり使う", () => {
    const expected = [
      ["regular-black-or-white", "internet", "https://www.youtube.com/playlist?list=PLDxonNcxMgrvoW0Dnj2N5Gm0QzC7rNoTd", "assets/regular-media/BoW.jpg"],
      ["regular-newznew", "internet", "https://newspicks.com/movie-series/208/", "assets/regular-media/newZnewバナー.jpeg"],
      ["regular-abema-prime", "internet", "https://abema.tv/video/title/89-66", "assets/regular-media/Abemaバナー画像.webp"],
      ["regular-maruku", "radio", "https://www.tfm.co.jp/maruku/", "assets/regular-media/maruku_kv_2026-06-23-031146_qhdt.jpg"],
      ["regular-namarriage", "internet", "https://naresome.co.jp/namarriage/", "assets/regular-media/ナマリッジ　バナー.jpg"]
    ];
    assert(JSON.stringify(regular.map((item) => [item.id, item.category, item.url, item.image])) === JSON.stringify(expected));
  });
  test("全件表示で設定順と元の配列を維持する", () => {
    const ids = regular.map((item) => item.id).join(",");
    assert(selectRegularMedia(regular).map((item) => item.id).join(",") === ids);
    assert(regular.map((item) => item.id).join(",") === ids);
  });
  test("ロゴ画像が未設定または不正な場合は拒否する", () => {
    for (const image of [undefined, null, "", " ", 42]) {
      throws(() => validateRegularMedia([{ ...regular[0], image }]));
    }
  });
  test("URLなしのロゴを受け付ける", () => {
    for (const url of [undefined, null, ""]) validateRegularMedia([{ ...regular[0], url }]);
  });
  test("提供された5番組はローカルのバナー画像を使う", () => {
    assert(regular.length === 5);
    assert(regular.every((item) => item.image.startsWith("assets/regular-media/") && !item.image.includes("sample-")));
    validateRegularMedia(regular);
  });
  test("ローカルのPNG・JPEG・WebPと日本語・空白を含むファイル名を受け付ける", () => {
    for (const image of ["assets/regular-media/sample-tv.png", "assets/regular-media/BoW.jpg", "assets/regular-media/newZnewバナー.jpeg", "assets/regular-media/Abemaバナー画像.webp", "assets/regular-media/maruku_kv_2026-06-23-031146_qhdt.jpg", "assets/regular-media/LOGO.JPEG", "assets/regular-media/ナマリッジ　バナー.jpg", "assets/regular-media/番組 バナー.jpg"]) {
      validateRegularMedia([{ ...regular[0], image }]);
    }
  });
  test("13件のレギュラーでも件数を制限しない", () => {
    const items = Array.from({ length: 13 }, (_, index) => ({ ...regular[index % regular.length], id: `regular-layout-${index}` }));
    assert(selectRegularMedia(items).length === 13);
  });
  test("HTTPSのロゴ画像URLを受け付ける", () => validateRegularMedia([{ ...regular[0], image: "https://example.com/logo.png" }]));
  test("未許可のローカルパスやデータURLを拒否する", () => {
    for (const image of ["../logo.png", "assets/regular-media/../logo.png", "assets\\regular-media\\logo.png", "assets/regular-media/%2e%2e/logo.png", "assets/regular-media/ナマリッジ　../logo.jpg", "assets/regular-media/ナマリッジ\tバナー.jpg", "assets/regular-media/logo.svg", "assets/regular-media/logo.gif", "assets/regular-media/logo.png.html", "//example.com/logo.png", "data:image/png;base64,AAAA"]) {
      throws(() => validateRegularMedia([{ ...regular[0], image }]));
    }
  });
  test("不明なレギュラーカテゴリを拒否する", () => throws(() => selectRegularMedia(regular, "unknown")));
  test("レギュラーメディアのID重複を拒否する", () => throws(() => validateRegularMedia([regular[0], regular[0]])));
  test("安全でない外部リンクを拒否する", () => throws(() => validateRegularMedia([{ ...regular[0], url: "javascript:alert(1)" }])));
  test("認証情報付きURLを拒否する", () => throws(() => validateRegularMedia([{ ...regular[0], url: "https://user:pass@example.com/" }])));
  test("HTTPSでない画像を拒否する", () => throws(() => validateRegularMedia([{ ...regular[0], image: "http://example.com/image.jpg" }])));
  test("画像の代替テキストがない場合は拒否する", () => throws(() => validateRegularMedia([{ ...regular[0], imageAlt: "" }])));
  test("空の番組タイトルを拒否する", () => throws(() => validateRegularMedia([{ ...regular[0], title: " " }])));
  test("レギュラーメディア0件を受け付ける", () => assert(selectRegularMedia([]).length === 0));
  test("不正なURL文字列を拒否する", () => throws(() => validateRegularMedia([{ ...regular[0], url: "not-a-url" }])));

  const contactConfig = { ...window.RK_CONTENT.contact, accessKey: "00000000-0000-4000-8000-000000000001" };
  const inquiry = { name: "動作確認", company: "テスト用", email: "test@example.com", message: "模擬テストです。\n実際には送信しません。", consent: "yes", "h-captcha-response": "test-captcha-token" };
  test("公開用のAccess Keyの形式を検証する", () => assert(validateConfig(window.RK_CONTENT.contact).accessKey === window.RK_CONTENT.contact.accessKey));
  test("未設定のキーは設定待ちとして扱う", () => assert(validateConfig({ ...contactConfig, accessKey: "" }).accessKey === ""));
  test("未設定のキーで送信データを作らない", () => throws(() => buildPayload({ ...contactConfig, accessKey: "" }, inquiry)));
  test("実アドレスをAccess Keyとして設定できない", () => throws(() => validateConfig({ ...contactConfig, accessKey: "office@example.com" })));
  test("文字列でないAccess Keyを拒否する", () => throws(() => validateConfig({ ...contactConfig, accessKey: 123 })));
  test("通知の差出人名への改行混入を拒否する", () => throws(() => validateConfig({ ...contactConfig, fromName: "担当\r\nBcc: other" })));
  test("問い合わせの件名不足を拒否する", () => {
    for (const subject of [undefined, "", " "]) throws(() => validateConfig({ ...contactConfig, subject }));
  });
  test("共通の件名とReply-To用メールを設定する", () => {
    const payload = buildPayload(contactConfig, inquiry);
    assert(payload.subject === contactConfig.subject && payload.email === inquiry.email && payload.from_name === contactConfig.fromName);
    assert(!Object.hasOwn(payload, "inquiry_type") && !Object.hasOwn(payload, "recipient") && !Object.hasOwn(payload, "to"));
  });
  test("入力に古い種別があっても共通の受付先・件名を使う", () => {
    for (const inquiry_type of ["media", "general", "__proto__"]) {
      const payload = buildPayload(contactConfig, { ...inquiry, inquiry_type });
      assert(payload.subject === contactConfig.subject && !Object.hasOwn(payload, "inquiry_type"));
    }
  });
  test("名前とメールの外側の空白を取り除く", () => {
    const payload = buildPayload(contactConfig, { ...inquiry, name: " 動作確認 ", email: " test@example.com " });
    assert(payload.name === "動作確認" && payload.email === "test@example.com");
  });
  test("会社・媒体名は未入力でも送信データを作れる", () => assert(buildPayload(contactConfig, { ...inquiry, company: undefined }).company === ""));
  test("名前・本文の空白だけの入力を拒否する", () => {
    for (const key of ["name", "message"]) throws(() => buildPayload(contactConfig, { ...inquiry, [key]: " \n " }));
  });
  test("不正な問い合わせメールアドレスを拒否する", () => {
    for (const email of ["invalid", "a@example.com\r\nBcc: other@example.com", "a@example.com?cc=other"]) throws(() => buildPayload(contactConfig, { ...inquiry, email }));
  });
  test("問い合わせの件名への改行混入を拒否する", () => throws(() => validateConfig({ ...contactConfig, subject: "お問い合わせ\r\nBcc: other" })));
  test("利用目的未確認の送信を拒否する", () => throws(() => buildPayload(contactConfig, { ...inquiry, consent: undefined })));
  test("hCaptchaの結果なしでは送信データを作らない", () => throws(() => buildPayload(contactConfig, { ...inquiry, "h-captcha-response": "" })));
  test("送信データにhCaptchaの結果を必ず含める", () => {
    const payload = buildPayload(contactConfig, inquiry);
    assert(payload["h-captcha-response"] === inquiry["h-captcha-response"]);
  });
  test("お名前と会社・媒体名への改行混入を拒否する", () => {
    for (const key of ["name", "company"]) throws(() => buildPayload(contactConfig, { ...inquiry, [key]: "担当\r\nBcc: other" }));
  });
  test("入力文字数の上限ちょうどの値を受け付ける", () => {
    const payload = buildPayload(contactConfig, { ...inquiry, name: "a".repeat(80), company: "a".repeat(120), message: "a".repeat(5000) });
    assert(payload.name.length === 80 && payload.company.length === 120 && payload.message.length === 5000);
  });
  test("入力文字数の上限を超えた値を拒否する", () => {
    for (const [key, count] of [["name", 81], ["company", 121], ["message", 5001]]) throws(() => buildPayload(contactConfig, { ...inquiry, [key]: "a".repeat(count) }));
  });
  test("問い合わせ本文の改行を維持する", () => assert(buildPayload(contactConfig, inquiry).message === inquiry.message));
  test("入力から送信先設定や件名を上書きさせない", () => {
    const payload = buildPayload(contactConfig, { ...inquiry, access_key: "other", subject: "other", recipient: "other@example.com" });
    assert(payload.access_key === contactConfig.accessKey && payload.subject === contactConfig.subject && !Object.hasOwn(payload, "recipient"));
  });
  test("成功にはHTTP正常と明示的なsuccess=trueの両方を要求する", () => {
    assert(isSuccess(true, { success: true }));
    assert(!isSuccess(false, { success: true }) && !isSuccess(true, { success: "true" }) && !isSuccess(true, { success: false }));
  });
  test("空・不正な応答を成功扱いしない", () => {
    for (const result of [null, [], "ok", {}, undefined]) assert(isSuccess(true, result) === false);
  });

  document.querySelector("#result").textContent = `${passed}件成功、${failed}件失敗`;
  document.body.dataset.testStatus = failed ? "failed" : "passed";
  document.title = `${failed ? "FAIL" : "PASS"}：掲載情報・問い合わせ処理 ${passed}/${passed + failed}`;
  if (failed) throw new Error(`${failed}件のブラウザテストが失敗しました。`);
})();

"use strict";

(() => {
  const errorBox = document.querySelector("#site-error");
  function reportError(message, error) {
    console.error(message, error);
    errorBox.textContent = message;
    errorBox.hidden = false;
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const watchedImages = new WeakSet();
  function watchImage(image) {
    if (watchedImages.has(image)) return;
    watchedImages.add(image);
    const onError = () => reportError("素材画像を読み込めませんでした。ファイルの配置とインターネット接続を確認してください。", new Error(image.src));
    image.addEventListener("error", onError, { once: true });
    if (image.getAttribute("src") && image.complete && !image.naturalWidth) onError();
  }

  function externalLink(className, url, text) {
    const link = element("a", className, text);
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  }

  const menuToggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector("#site-nav");
  const mobileQuery = matchMedia("(max-width: 899px)");
  function closeMenu(returnFocus = false) {
    nav.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("menu-open");
    if (returnFocus) menuToggle.focus();
  }
  menuToggle.hidden = false;
  document.documentElement.classList.add("has-js");
  menuToggle.addEventListener("click", () => {
    const open = menuToggle.getAttribute("aria-expanded") !== "true";
    menuToggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
    document.body.classList.toggle("menu-open", open);
  });
  nav.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest("a") : null;
    if (!link) return;
    closeMenu();
    const target = document.getElementById(link.hash.slice(1));
    if (target) {
      target.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") closeMenu(true);
  });
  document.addEventListener("click", (event) => {
    if (mobileQuery.matches && event.target instanceof Node && !nav.contains(event.target) &&
        !menuToggle.contains(event.target)) closeMenu();
  });
  mobileQuery.addEventListener("change", () => closeMenu());

  const creditsToggle = document.querySelector("#credits-toggle");
  const credits = document.querySelector("#credits");
  creditsToggle.hidden = false;
  credits.hidden = true;
  creditsToggle.addEventListener("click", () => {
    const expanded = creditsToggle.getAttribute("aria-expanded") !== "true";
    creditsToggle.setAttribute("aria-expanded", String(expanded));
    credits.hidden = !expanded;
  });

  function newsRow(item) {
    const details = element("details", "news-item");
    details.id = item.id;
    const summary = element("summary", "news-item__summary");
    const meta = element("span", "news-item__meta");
    const date = element("time", "", window.RKNews.formatDate(item.publishedAt));
    date.dateTime = item.publishedAt;
    meta.append(date, element("span", `category category--${item.category}`, window.RKNews.categories[item.category]));
    const title = element("span", "news-item__title", item.title);
    summary.append(meta, title, element("span", "news-item__expand", "+"));
    summary.lastElementChild.setAttribute("aria-hidden", "true");
    const body = element("div", "news-item__body");
    body.append(element("p", "sample-label", "表示確認用サンプル・実際の出演情報ではありません"));
    if (item.startsAt) body.append(element("p", "news-item__when", `${window.RKNews.formatDate(item.startsAt, "event")}（日本時間）`));
    if (item.image) {
      const image = element("img", "news-item__image");
      image.alt = item.imageAlt;
      image.width = 800;
      image.height = 450;
      image.loading = "lazy";
      watchImage(image);
      image.src = item.image;
      body.append(image);
    }
    item.paragraphs.forEach((text) => body.append(element("p", "", text)));
    details.append(summary, body);
    details.addEventListener("toggle", () => {
      summary.lastElementChild.textContent = details.open ? "−" : "+";
    });
    return details;
  }

  function regularMediaLogo(item) {
    const logo = item.url
      ? externalLink("regular-media-logo", item.url)
      : element("div", "regular-media-logo");
    if (item.url) {
      logo.setAttribute("aria-label", `${item.title}の外部サイト（新しいタブ）`);
    }
    const image = element("img", "regular-media-logo__image");
    image.alt = item.imageAlt;
    image.width = 600;
    image.height = 240;
    image.loading = "lazy";
    watchImage(image);
    image.src = item.image;
    logo.append(image);
    return logo;
  }

  try {
    if (!window.RKNews || !window.RK_CONTENT) throw new Error("表示データまたは処理ファイルが読み込まれていません。");
    const list = document.querySelector("#regular-media-list");
    const filters = document.querySelector(".regular-media-filters");
    function renderRegularMedia(category) {
      const items = window.RKNews.selectRegularMedia(window.RK_CONTENT.regularMedia, category);
      const fragment = document.createDocumentFragment();
      items.forEach((item) => fragment.append(regularMediaLogo(item)));
      if (!items.length) fragment.append(element("p", "message", "このカテゴリのレギュラーメディアはまだありません。"));
      list.replaceChildren(fragment);
      document.querySelector("#regular-media-status").textContent = `${window.RKNews.regularCategories[category]}のレギュラーメディアを表示しています。`;
      filters.querySelectorAll("button").forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.regularCategory === category));
      });
    }
    renderRegularMedia("all");
    filters.hidden = false;
    filters.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("button[data-regular-category]") : null;
      if (!button) return;
      try {
        renderRegularMedia(button.dataset.regularCategory);
      } catch (error) {
        reportError("レギュラーメディアの表示に失敗しました。ページを再読み込みしてください。", error);
      }
    });
  } catch (error) {
    document.querySelector("#regular-media-list").replaceChildren(element("p", "message", "レギュラーメディアを表示できませんでした。設定を確認してください。"));
    reportError("レギュラーメディアの読み込みに失敗しました。設定を確認してください。", error);
  }

  try {
    if (!window.RKNews || !window.RK_CONTENT) throw new Error("表示データまたは処理ファイルが読み込まれていません。");
    const data = window.RK_CONTENT;
    window.RKNews.validateNews(data.news);
    const list = document.querySelector("#news-list");
    const filters = document.querySelector(".news-filters");
    function renderNews(category) {
      const items = window.RKNews.selectNews(data.news, category);
      const fragment = document.createDocumentFragment();
      items.forEach((item) => fragment.append(newsRow(item)));
      if (!items.length) fragment.append(element("p", "message", "このカテゴリのお知らせはまだありません。"));
      list.replaceChildren(fragment);
      document.querySelector("#news-count").textContent = `${window.RKNews.categories[category]}：${items.length}件（サンプル）`;
      filters.querySelectorAll("button").forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.category === category));
      });
    }
    renderNews("all");
    filters.hidden = false;
    filters.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("button[data-category]") : null;
      if (!button) return;
      try {
        renderNews(button.dataset.category);
      } catch (error) {
        reportError("ニュースの表示に失敗しました。ページを再読み込みしてください。", error);
      }
    });

  } catch (error) {
    document.querySelector("#news-list").replaceChildren(element("p", "message", "ニュースを表示できませんでした。ページを再読み込みしてください。"));
    reportError("表示データの読み込みに失敗しました。ニュースの設定を確認してください。", error);
  }

  const contactForm = document.querySelector("#contact-form");
  const contactFields = document.querySelector("#contact-fields");
  const contactSubmit = document.querySelector("#contact-submit");
  const contactSubmitContent = [...contactSubmit.childNodes];
  const contactStatus = document.querySelector("#contact-status");
  const consent = contactForm.querySelector('[name="consent"]');
  const webOrigin = location.protocol === "https:";
  let contactConfig;
  let submitting = false;
  let captchaToken = "";
  let captchaRequested = false;
  let captchaBroken = false;
  let captchaTimer;

  function contactFeedback(message, state, focus = false) {
    contactStatus.textContent = message;
    contactStatus.className = `contact-feedback contact-feedback--${state}`;
    contactStatus.setAttribute("role", state === "error" ? "alert" : "status");
    contactStatus.setAttribute("aria-live", state === "error" ? "assertive" : "polite");
    contactStatus.hidden = !message;
    if (focus) contactStatus.focus();
  }
  function updateContactSubmit() {
    contactSubmit.disabled = submitting || !contactConfig?.accessKey || !webOrigin ||
      !consent.checked || !captchaToken || captchaBroken;
  }
  function captchaFailure(message, code) {
    captchaToken = "";
    updateContactSubmit();
    console.error("送信確認を利用できません。", code);
    contactFeedback(message, "error");
  }
  window.rkContactCaptchaReady = () => {
    clearTimeout(captchaTimer);
    captchaBroken = false;
    updateContactSubmit();
    contactFeedback("送信確認のチェックを完了してください。", "setup");
  };
  window.rkContactCaptchaVerified = (token) => {
    if (typeof token !== "string" || !token) {
      captchaFailure("送信確認の結果を取得できませんでした。認証をやり直してください。", "empty-token");
      return;
    }
    captchaToken = token;
    captchaBroken = false;
    updateContactSubmit();
    if (webOrigin && contactConfig?.accessKey && consent.checked) contactFeedback("", "setup");
  };
  window.rkContactCaptchaExpired = () => {
    captchaToken = "";
    updateContactSubmit();
    contactFeedback("送信確認の有効期限が切れました。もう一度チェックしてください。", "error");
  };
  window.rkContactCaptchaError = (code) => {
    captchaFailure("送信確認を完了できませんでした。認証枠の再試行を行ってください。入力内容は残っています。", code);
  };
  function loadContactCaptcha() {
    if (!consent.checked || !contactConfig?.accessKey || !webOrigin || captchaRequested) return;
    captchaRequested = true;
    document.querySelector("#contact-captcha-area").hidden = false;
    contactFeedback("送信確認を読み込んでいます。", "setup");
    captchaTimer = setTimeout(() => {
      captchaBroken = true;
      captchaFailure("送信確認を読み込めませんでした。接続を確認し、再読み込みする場合は入力内容を先に控えてください。", "load-timeout");
    }, 15000);
    const script = document.createElement("script");
    script.src = "https://web3forms.com/client/script.js";
    script.async = true;
    script.addEventListener("error", () => {
      clearTimeout(captchaTimer);
      captchaBroken = true;
      captchaFailure("送信確認を読み込めませんでした。接続やブラウザの制限を確認してください。入力内容は残っています。", "script-load");
    }, { once: true });
    document.body.append(script);
  }
  consent.addEventListener("change", () => {
    loadContactCaptcha();
    updateContactSubmit();
  });
  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting || !contactForm.reportValidity()) return;
    if (!webOrigin) {
      contactFeedback("送信にはHTTPS環境とhCaptcha認証が必要です。このプレビューからは送信されません。", "setup", true);
      return;
    }
    let payload;
    let captchaApi;
    try {
      payload = window.RKContact.buildPayload(contactConfig, {
        ...Object.fromEntries(new FormData(contactForm)),
        "h-captcha-response": captchaToken
      });
      captchaApi = window.hcaptcha;
      if (!captchaApi || typeof captchaApi.reset !== "function") throw new Error("送信確認の読み込みを待ってから、もう一度お試しください。");
    } catch (error) {
      console.error("お問い合わせの入力を確認してください。", error);
      contactFeedback(error instanceof Error ? error.message : "入力内容を確認してください。", "error", true);
      return;
    }
    submitting = true;
    contactFields.disabled = true;
    contactForm.setAttribute("aria-busy", "true");
    contactSubmit.textContent = "送信中…";
    updateContactSubmit();
    contactFeedback("送信しています。画面を閉じずにお待ちください。", "setup");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let accepted = false;
    let failureMessage = "送信結果を確認できませんでした。入力内容は残っています。重複送信に注意し、時間をおいてお試しください。";
    try {
      const response = await fetch(contactForm.action, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const result = await response.json();
      if (!window.RKContact.isSuccess(response.ok, result)) {
        failureMessage = response.status === 429
          ? "受付の上限に達した可能性があります。時間をおいてお試しください。入力内容は残っています。"
          : "送信を受け付けられませんでした。入力内容は残っています。送信確認をやり直し、時間をおいてお試しください。";
        throw new Error(`Web3Forms response: ${response.status}`);
      }
      accepted = true;
      contactForm.reset();
      contactFeedback("送信を受け付けました。お問い合わせありがとうございます。", "success", true);
    } catch (error) {
      console.error("お問い合わせの送信結果を確認できません。", error instanceof Error ? error.name : "UnknownError");
      if (controller.signal.aborted) failureMessage = "送信に時間がかかり、結果を確認できませんでした。入力内容は残っています。重複送信を避けるため、時間をおいて確認してください。";
      contactFeedback(failureMessage, "error", true);
    } finally {
      clearTimeout(timer);
      captchaToken = "";
      try {
        captchaApi.reset();
      } catch (error) {
        captchaBroken = true;
        console.error("送信確認を初期化できません。", error instanceof Error ? error.name : "UnknownError");
        contactFeedback(`${contactStatus.textContent} ${accepted ? "次の送信の前にページを再読み込みしてください。" : "認証の再読み込みが必要です。入力内容を控えてからページを再読み込みしてください。"}`, accepted ? "success" : "error");
      }
      submitting = false;
      contactFields.disabled = false;
      contactForm.removeAttribute("aria-busy");
      contactSubmit.replaceChildren(...contactSubmitContent);
      updateContactSubmit();
    }
  });
  try {
    if (!window.RKContact || !window.RK_CONTENT) throw new Error("問い合わせの処理ファイルが読み込まれていません。");
    contactConfig = window.RKContact.validateConfig(window.RK_CONTENT.contact);
    document.querySelector("#contact-access-key").value = contactConfig.accessKey;
    contactFields.disabled = false;
    if (!contactConfig.accessKey) {
      contactFeedback("送信先の設定待ちです。このベータからは送信されません。", "setup");
    } else if (!webOrigin) {
      contactFeedback("送信にはHTTPS環境とhCaptcha認証が必要です。このプレビューからは送信されません。", "setup");
    } else {
      contactFeedback("利用目的と外部送信を確認すると、送信確認が表示されます。", "setup");
    }
    updateContactSubmit();
  } catch (error) {
    console.error("問い合わせの初期化に失敗しました。", error);
    contactFeedback("問い合わせの設定を読み込めませんでした。担当者が設定を確認してください。この状態では送信されません。", "error");
  }

  document.querySelectorAll("img").forEach(watchImage);
  if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    document.querySelectorAll(".hero-copy > *, .hero-figure, .section-intro, .news-item, .regular-media-logo, .profile-copy > *, .social-links > a").forEach((node) => observer.observe(node));
  }
})();

"use strict";

(async () => {
  let passed = 0, failed = 0;
  for (const { name, run } of globalThis.RKNewsChecks) {
    const item = document.createElement("li");
    try {
      await run();
      passed++;
      item.className = "pass";
      item.textContent = `PASS：${name}`;
    } catch (error) {
      failed++;
      item.className = "fail";
      item.textContent = `FAIL：${name}／${error.message}`;
      console.error("ニュース連携テストに失敗しました。", name, error);
    }
    document.querySelector("#tests").append(item);
  }
  document.querySelector("#result").textContent = `${passed}件成功、${failed}件失敗`;
  document.body.dataset.testStatus = failed ? "failed" : "passed";
  document.title = `${failed ? "FAIL" : "PASS"}：ニュース連携 ${passed}/${passed + failed}`;
})();

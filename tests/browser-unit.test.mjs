import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import test from "node:test";

test("the 64 browser helper checks also pass in Node", () => {
  const rows = [], result = {}, body = { dataset: {} };
  const document = {
    body,
    createElement(tag) { assert.equal(tag, "li"); return {}; },
    querySelector(selector) {
      if (selector === "#result") return result;
      if (selector === "#tests") return { append: row => rows.push(row) };
      throw new Error(`Unexpected reporting element: ${selector}`);
    }
  };
  const sandbox = { document, console, URL, structuredClone };
  sandbox.window = sandbox;
  const context = createContext(sandbox);
  for (const name of ["content.js", "news.js", "contact.js", "tests/browser-tests.js"]) {
    runInContext(readFileSync(new URL("../" + name, import.meta.url), "utf8"), context, { filename: name });
  }
  assert.equal(body.dataset.testStatus, "passed");
  assert.equal(rows.length, 64);
  assert(rows.every(row => row.className === "pass"));
  assert.equal(result.textContent, "64件成功、0件失敗");
});

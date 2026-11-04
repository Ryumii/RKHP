import test from "node:test";
import "../news.js";
import "../workers/news/source.js";
import "../workers/news/worker.js";
import "./news-sync-cases.js";

for (const { name, run } of globalThis.RKNewsChecks) test(name, run);

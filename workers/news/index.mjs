import "../../news.js";
import "./source.js";
import "./worker.js";

export default {
  fetch(request, env) {
    return globalThis.RKNewsWorker.fetch(request, env);
  },
  scheduled(event, env, context) {
    if (globalThis.RKSheetSource.readConfig(env).mode === "pull") {
      context.waitUntil(globalThis.RKNewsWorker.sync(env));
    }
  }
};

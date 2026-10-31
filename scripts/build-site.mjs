import {
  copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync,
  realpathSync, rmSync, writeFileSync
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

export function buildSite(rootDir) {
  const root = realpathSync(rootDir);
  const context = createContext({ window: {}, URL });
  for (const name of ["content.js", "news.js"]) {
    runInContext(readFileSync(join(root, name), "utf8"), context, { filename: name, timeout: 1000 });
  }
  const media = context.window.RKNews.validateRegularMedia(context.window.RK_CONTENT.regularMedia);
  const files = [...new Set([
    "index.html", "styles.css", "content.js", "news.js", "contact.js", "app.js",
    "assets/profile/profile1-web.jpg", "assets/profile/profile4-web.jpg",
    "assets/social/youtube.svg", "assets/social/instagram.svg",
    "assets/social/x.svg", "assets/social/tiktok.svg",
    ...media.filter(item => item.image.startsWith("assets/regular-media/")).map(item => item.image)
  ])];
  for (const name of files) {
    const source = join(root, ...name.split("/"));
    if (!lstatSync(source).isFile() || !realpathSync(source).startsWith(root + sep)) {
      throw new Error(`Published file must be a regular file inside the project: ${name}`);
    }
  }
  const html = readFileSync(join(root, "index.html"), "utf8");
  if (/(?:href|src)\s*=\s*["'](?:\.\/)?(?:docs|tests|\.agents)\//i.test(html)) {
    throw new Error("The public page must not link to documentation, tests or agent files.");
  }
  const output = join(root, "dist");
  if (existsSync(output) && lstatSync(output).isSymbolicLink()) {
    throw new Error("The generated dist directory must not be a symbolic link.");
  }
  rmSync(output, { recursive: true, force: true });
  for (const name of files) {
    const destination = join(output, ...name.split("/"));
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(root, ...name.split("/")), destination);
  }
  writeFileSync(join(output, ".nojekyll"), "");
  return [...files, ".nojekyll"];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = buildSite(fileURLToPath(new URL("../", import.meta.url)));
  console.log(`Built dist: ${files.length} files. Documentation and original photos are excluded.`);
}

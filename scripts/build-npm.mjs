import fs from "node:fs/promises";
import { buildPuppeteerBundle, writeDependencyNotices } from "./bundle.mjs";

await fs.mkdir("lib", { recursive: true });
const metafile = await buildPuppeteerBundle("lib/puppeteer.js");
await writeDependencyNotices(metafile, "lib/THIRD_PARTY_NOTICES.txt");
await fs.chmod("lib/index.js", 0o755);

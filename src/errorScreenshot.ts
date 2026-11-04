import fs from "node:fs/promises";
import type { Page } from "puppeteer-core";

export async function saveErrorScreenshotAsync(
  page: Pick<Page, "screenshot">,
  outputPath: string,
): Promise<void> {
  // Puppeteer's path option uses ordinary writeFile defaults. Capture in memory
  // so the file is private from creation and existing files/symlinks are refused.
  const image = await page.screenshot({ type: "png" });
  await fs.writeFile(outputPath, image, { mode: 0o600, flag: "wx" });
}

import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const destDir = join(root, "dist", "tray");

await mkdir(destDir, { recursive: true });
await copyFile(join(root, "src", "tray", "index.html"), join(destDir, "index.html"));

console.log("copied tray/index.html");

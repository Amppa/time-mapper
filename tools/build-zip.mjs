import fs from "node:fs";
import { execFileSync } from "node:child_process";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const zipName = `time-mapper-v${manifest.version}.zip`;

execFileSync("tar.exe", ["-a", "-c", "-f", zipName, "manifest.json", "_locales", "assets", "src"], { stdio: "inherit" });
console.log(`Successfully built ${zipName}`);

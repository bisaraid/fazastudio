import { execFile } from "child_process";
import { setTimeout as sleep } from "timers/promises";
import { writeFileSync } from "fs";

// Lokasi npm.cmd (Windows) — resolve via `where npm` fallback.
const npmCmd = process.env.NPM_CMD || "npm.cmd";

let result;
try {
  result = execFile(npmCmd, ["run", "build"], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
} catch (e) {
  console.log("EXEC_FAIL", e.message);
  process.exit(1);
}

const out = [];
result.stdout.on("data", (c) => out.push(c.toString()));
result.stderr.on("data", (c) => out.push(c.toString()));

let code = null;
try {
  code = await result;
} catch (e) {
  console.log("SPAWN_ERR", e.message);
}

await sleep(500); // drain

const full = out.join("");
writeFileSync("build-out.txt", full, "utf8");
console.log("exitCode=" + code);
console.log("=== LAST 3000 ===");
console.log(full.slice(-3000));
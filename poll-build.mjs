import { readFileSync, existsSync } from "fs";
import { setTimeout as sleep } from "timers/promises";

for (let i = 0; i < 120; i++) {
  if (existsSync("build-out.txt")) {
    const s = readFileSync("build-out.txt", "utf8");
    if (
      s.includes("Compiled successfully") ||
      s.includes("Failed to compile") ||
      s.includes("Type error") ||
      s.includes("error TS")
    ) {
      console.log("=== BUILD RESULT (last 2500) ===");
      console.log(s.slice(-2500));
      process.exit(s.includes("Compiled successfully") ? 0 : 1);
    }
  }
  await sleep(2000);
}
console.log("POLL_TIMEOUT_EXIT");
process.exit(1);
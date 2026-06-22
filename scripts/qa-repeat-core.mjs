import { spawnSync } from "node:child_process";

const repeat = Number(process.env.QA_REPEAT_COUNT ?? process.argv[2] ?? 5);
const count = Number.isFinite(repeat) && repeat > 0 ? Math.floor(repeat) : 5;
const checks = [];

for (let index = 1; index <= count; index += 1) {
  const run = spawnSync(process.execPath, ["scripts/qa-core-flow.mjs", "--mock"], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  const ok = run.status === 0;
  checks.push({ label: `mock core flow run ${index}/${count}`, ok });
  if (!ok) {
    console.error(run.stdout);
    console.error(run.stderr);
    console.error(JSON.stringify({ status: "failed", checks }, null, 2));
    process.exit(1);
  }
}

console.log(JSON.stringify({ status: "passed", repeat: count, checks }, null, 2));

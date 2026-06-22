const baseUrl = normalizeBaseUrl(process.env.PUBLIC_BASE_URL ?? process.argv[2] ?? "https://ios-ai-app-minimax-music-api.vercel.app");
const checks = [];

try {
  const home = await request("/", { expectJson: false });
  assert(home.status === 200, `home page returns 200 (got ${home.status})`);
  assert(String(home.body).includes("Green Sonic"), "home page contains product shell");

  const health = await request("/api/health");
  assert(health.status === 200, `health returns 200 (got ${health.status})`);
  assert(health.body?.status === "ok", "health status is ok");

  const guest = await request("/api/auth/guest", { method: "POST" });
  assert(guest.status === 201 || guest.status === 200, `guest auth returns success (got ${guest.status})`);
  assert(typeof guest.body?.token === "string", "guest auth returns token");

  const headers = { Authorization: `Bearer ${guest.body.token}` };
  const me = await request("/api/me", { headers });
  assert(me.status === 200, `me returns 200 (got ${me.status})`);
  assert(me.body?.user?.id === guest.body.user.id, "me returns same guest user");

  const feed = await request("/api/feed", { headers });
  assert(feed.status === 200, `feed returns 200 (got ${feed.status})`);
  assert(Array.isArray(feed.body), "feed response is an array");

  const challenge = await request("/api/challenges/daily", { headers });
  assert(challenge.status === 200, `daily challenge returns 200 (got ${challenge.status})`);
  assert(typeof challenge.body?.id === "string", "daily challenge has id");

  const rewards = await request("/api/reward/history", { headers });
  assert(rewards.status === 200, `reward history returns 200 (got ${rewards.status})`);
  assert(typeof rewards.body?.balance === "number", "reward history has balance");

  console.log(JSON.stringify({ status: "passed", baseUrl, checks }, null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        baseUrl,
        checks,
        message: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
}

async function request(pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: options.expectJson === false ? "text/html,*/*" : "application/json",
      ...(options.headers ?? {})
    }
  });
  const text = await response.text();
  return {
    status: response.status,
    body: options.expectJson === false ? text : text ? JSON.parse(text) : null
  };
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function assert(condition, label) {
  checks.push({ label, ok: Boolean(condition) });
  if (!condition) {
    throw new Error(label);
  }
}

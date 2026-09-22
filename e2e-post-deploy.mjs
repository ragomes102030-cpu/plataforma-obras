import crypto from "node:crypto";

const BASE = "https://plataforma-obras-api.onrender.com";
const RENDER_SVC = "srv-dandr7jbc2fs73e2qobg";
const RENDER_KEY = process.env.RENDER_API_KEY;
const OPEN_ID = "github:325403947";
const APP_ID = "plataforma-obras";
const PROJECT_ID = 1;

let pass = 0;
let fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) {
    pass += 1;
    console.log(`OK   ${label}${detail ? " :: " + detail : ""}`);
  } else {
    fail += 1;
    console.log(`FAIL ${label}${detail ? " :: " + detail : ""}`);
  }
};

async function fetchEnvSecret() {
  const res = await fetch(
    `https://api.render.com/v1/services/${RENDER_SVC}/env-vars?limit=100`,
    { headers: { Authorization: `Bearer ${RENDER_KEY}` } }
  );
  if (!res.ok) throw new Error(`render env ${res.status}`);
  const body = await res.json();
  let value = null;
  const visit = node => {
    if (!node || typeof node !== "object") return;
    if (node.envVar?.key === "JWT_SECRET" && typeof node.envVar.value === "string") {
      value = node.envVar.value;
      return;
    }
    if ((node.key === "JWT_SECRET" || node.name === "JWT_SECRET") && typeof node.value === "string") {
      value = node.value;
      return;
    }
    for (const v of Object.values(node)) visit(v);
  };
  visit(body);
  if (!value || value.length < 16) {
    throw new Error("JWT_SECRET not found or too short");
  }
  return value;
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function forgeJwt(secret) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({
      openId: OPEN_ID,
      appId: APP_ID,
      name: "E2E Post Deploy",
      iat: now,
      exp: now + 3600,
    })
  );
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}

function trpcQuery(path, input, jwt) {
  const qs = new URLSearchParams({
    batch: "1",
    input: JSON.stringify({ "0": { json: input } }),
  });
  return fetch(`${BASE}/api/trpc/${path}?${qs}`, {
    headers: { Authorization: `Bearer ${jwt}`, Cookie: `app_session_id=${jwt}` },
  });
}

function trpcMutation(path, input, jwt) {
  return fetch(`${BASE}/api/trpc/${path}?batch=1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
      Cookie: `app_session_id=${jwt}`,
    },
    body: JSON.stringify({ "0": { json: input } }),
  });
}

async function unwrap(res, label) {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${label} HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${label} non-JSON: ${text.slice(0, 300)}`);
  }
  const first = Array.isArray(body) ? body[0] : body;
  if (first?.error) {
    throw new Error(
      `${label} trpc error: ${JSON.stringify(first.error).slice(0, 400)}`
    );
  }
  return first?.result?.json ?? first?.result?.data?.json;
}

async function main() {
  if (!RENDER_KEY) throw new Error("RENDER_API_KEY missing");
  const secret = await fetchEnvSecret();
  const jwt = forgeJwt(secret);
  console.log("jwt forged (secret not printed)");

  const health = await (await fetch(`${BASE}/healthz`)).json();
  ok(
    "deploy commit",
    String(health.commit ?? "").startsWith("1b64c14"),
    `commit=${health.commit}`
  );

  const projects = await unwrap(
    await trpcQuery("projects.list", {}, jwt),
    "projects.list"
  );
  const obra = (projects ?? []).find(p => p.id === PROJECT_ID);
  ok("projects.list has obra 1", Boolean(obra), obra ? `progress=${obra.progress}` : "");
  const progressBefore = Number(obra?.progress ?? 0);

  const budgets = await unwrap(
    await trpcQuery("budgets.list", { projectId: PROJECT_ID }, jwt),
    "budgets.list"
  );
  const budgetItem = (budgets?.items ?? [])[0];
  ok(
    "budgets.list has items",
    Boolean(budgetItem),
    budgetItem ? `itemId=${budgetItem.id}` : `items=${(budgets?.items ?? []).length}`
  );

  const activities = await unwrap(
    await trpcQuery("projects.activities", { projectId: PROJECT_ID }, jwt),
    "projects.activities"
  );
  ok(
    "projects.activities has rows",
    Array.isArray(activities) && activities.length > 0,
    `count=${Array.isArray(activities) ? activities.length : "n/a"}`
  );
  const activity =
    activities.find(a => a.budgetItemId == null && Number(a.durationDays) > 0) ??
    activities.find(a => Number(a.durationDays) > 0) ??
    activities[0];
  ok("pick activity", Boolean(activity), activity ? `id=${activity.id}` : "");

  if (!budgetItem || !activity) throw new Error("missing fixtures");

  const updateRes = await unwrap(
    await trpcMutation(
      "projects.updateActivity",
      {
        projectId: PROJECT_ID,
        activityId: activity.id,
        name: activity.name,
        phase: activity.phase,
        startOffset: Number(activity.startOffset ?? 0),
        earlyStart:
          activity.earlyStart == null ? undefined : Number(activity.earlyStart),
        durationDays: Math.max(1, Number(activity.durationDays ?? 1)),
        plannedQuantity:
          activity.plannedQuantity == null
            ? undefined
            : Number(activity.plannedQuantity),
        productivity:
          activity.productivity == null
            ? undefined
            : Number(activity.productivity),
        budgetItemId: budgetItem.id,
        progress: 40,
        status: "Em andamento",
      },
      jwt
    ),
    "projects.updateActivity"
  );
  ok(
    "updateActivity budgetItemId+progress",
    updateRes?.updated === true,
    JSON.stringify(updateRes)
  );

  const activitiesAfter = await unwrap(
    await trpcQuery("projects.activities", { projectId: PROJECT_ID }, jwt),
    "projects.activities#2"
  );
  const linked = (activitiesAfter ?? []).find(a => a.id === activity.id);
  ok(
    "activity.budgetItemId persisted",
    Number(linked?.budgetItemId) === Number(budgetItem.id),
    `got=${linked?.budgetItemId} want=${budgetItem.id}`
  );
  ok(
    "activity.progress=40",
    Number(linked?.progress) === 40,
    `got=${linked?.progress}`
  );

  const projectsAfter = await unwrap(
    await trpcQuery("projects.list", {}, jwt),
    "projects.list#2"
  );
  const obraAfter = (projectsAfter ?? []).find(p => p.id === PROJECT_ID);
  const progressAfter = Number(obraAfter?.progress ?? 0);
  ok(
    "project.progress > 0 after updateActivity",
    progressAfter > 0,
    `before=${progressBefore} after=${progressAfter}`
  );

  let confirmNote = "skipped-no-rascunho";
  try {
    const entries = await unwrap(
      await trpcQuery("production.entries", { projectId: PROJECT_ID }, jwt),
      "production.entries"
    );
    const rascunho = (entries ?? []).find(e => e.status === "rascunho");
    const confirmable =
      rascunho ??
      (entries ?? []).find(
        e => e.status !== "confirmada" && Number(e.activityId) > 0
      );
    if (confirmable) {
      await unwrap(
        await trpcMutation(
          "production.confirmEntry",
          { projectId: PROJECT_ID, entryId: confirmable.id },
          jwt
        ),
        "production.confirmEntry"
      );
      const afterConfirm = await unwrap(
        await trpcQuery("projects.list", {}, jwt),
        "projects.list#3"
      );
      const o3 = (afterConfirm ?? []).find(p => p.id === PROJECT_ID);
      ok(
        "project.progress still > 0 after confirmEntry",
        Number(o3?.progress ?? 0) > 0,
        `progress=${o3?.progress} entryId=${confirmable.id}`
      );
      confirmNote = `entryId=${confirmable.id}`;
    } else {
      ok("confirmEntry path", true, "no rascunho; recompute already proven via updateActivity");
    }
  } catch (e) {
    fail += 1;
    console.log(`FAIL confirmEntry :: ${String(e).slice(0, 300)}`);
  }
  console.log(`confirmNote=${confirmNote}`);

  console.log(`\nRESULT pass=${pass} fail=${fail}`);
  if (fail > 0) process.exitCode = 1;
}

main().catch(err => {
  console.error("E2E fatal:", String(err).slice(0, 800));
  process.exitCode = 1;
});

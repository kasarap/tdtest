// Rev 7 – Fix save routing + keep calendar date input
export async function onRequest(context) {
  const { request, env } = context;
  const kv = env.APP_KV;
  if (!kv) return json({ error: "Missing KV binding APP_KV" }, 500);

  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  // /api/entries  (CRUD)
  const projectRaw = url.searchParams.get("project");
  const project = sanitizeProject(projectRaw);
  if (!project) return json({ error: "Missing or invalid project" }, 400);

  const key = `entries:${project}`;

  if (method === "GET") {
    const data = await readProject(kv, key);
    data.entries.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return json({ project, entries: data.entries });
  }

  if (method === "POST") {
    const body = await request.json().catch(() => null);
    const entry = body?.entry;
    if (!entry) return json({ error: "Missing entry" }, 400);

    const data = await readProject(kv, key);
    const now = new Date().toISOString();

    const newEntry = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...normalizeEntry(entry),
    };

    data.entries.push(newEntry);
    await kv.put(key, JSON.stringify(data));
    return json({ ok: true, entry: newEntry });
  }

  if (method === "PUT") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "Missing id" }, 400);

    const body = await request.json().catch(() => null);
    const entry = body?.entry;
    if (!entry) return json({ error: "Missing entry" }, 400);

    const data = await readProject(kv, key);
    const idx = data.entries.findIndex(e => e.id === id);
    if (idx < 0) return json({ error: "Not found" }, 404);

    data.entries[idx] = {
      ...data.entries[idx],
      ...normalizeEntry(entry),
      updatedAt: new Date().toISOString(),
    };

    await kv.put(key, JSON.stringify(data));
    return json({ ok: true, entry: data.entries[idx] });
  }

  if (method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "Missing id" }, 400);

    const data = await readProject(kv, key);
    const before = data.entries.length;
    data.entries = data.entries.filter(e => e.id !== id);

    if (data.entries.length === before) return json({ error: "Not found" }, 404);

    await kv.put(key, JSON.stringify(data));
    return json({ ok: true, id });
  }

  return json({ error: "Method not allowed" }, 405);
}

async function readProject(kv, key) {
  const raw = await kv.get(key, { type: "json" });
  if (raw && typeof raw === "object" && Array.isArray(raw.entries)) return raw;
  return { entries: [] };
}

function normalizeEntry(e) {
  return {
    date: safeStr(e.date),
    foam: safeStr(e.foam),
    fuel: safeStr(e.fuel),
    testType: safeStr(e.testType),
    airTemp: safeStr(e.airTemp),
    wind: safeStr(e.wind),
    fuelTemp: safeStr(e.fuelTemp),
    solutionTemp: safeStr(e.solutionTemp),
    controlTime: safeTime(e.controlTime),
    extinguishmentTime: safeTime(e.extinguishmentTime),
    savedTime: safeStr(e.savedTime),
  };
}

function safeStr(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function safeTime(v) {
  const s = safeStr(v);
  if (!s) return "";
  const m = s.match(/^(\d{1,2}):([0-5]\d)$/);
  return m ? `${Number(m[1])}:${m[2]}` : "";
}

function sanitizeProject(s) {
  if (!s) return "";
  const out = String(s).trim().replace(/\s+/g, " ").slice(0, 80);
  if (!out || out.length < 2) return "";
  return out.replace(/[^\w .\-]/g, "");
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

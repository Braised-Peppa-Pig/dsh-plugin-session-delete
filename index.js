import { promises as fs } from "node:fs";
import path from "node:path";
import * as zlib from "node:zlib";

const ID_RE = /^(?:session-)?[A-Za-z0-9][A-Za-z0-9._-]{5,120}$/;

function dshHome(config = {}) {
  return path.resolve(config.dshHome || process.env.DSH_HOME || path.join(process.env.USERPROFILE || process.env.HOME || ".", ".dsh"));
}

function roots(config = {}) {
  const home = dshHome(config);
  return {
    home,
    sessions: path.resolve(config.sessionsRoot || path.join(home, "sessions")),
    storages: path.resolve(config.storagesRoot || path.join(home, "storages")),
  };
}

function safeId(value) {
  if (typeof value !== "string" || !ID_RE.test(value) || value.includes("..") || value.includes("/") || value.includes("\\")) return null;
  return value;
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error && error.code === "ENOENT") return fallback; throw error; }
}

async function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(tmp, file);
}

function removeSessionRefs(workspace, id) {
  let changed = false;
  const global = workspace && workspace.global;
  if (global) {
    for (const key of ["archivedSessionIds", "pinnedSessionIds"]) {
      if (!Array.isArray(global[key])) continue;
      const next = global[key].filter((value) => value !== id);
      if (next.length !== global[key].length) { global[key] = next; changed = true; }
    }
  }
  const workspaces = workspace && workspace.tables && workspace.tables.workspaces;
  if (workspaces && typeof workspaces === "object") {
    for (const workspace of Object.values(workspaces)) {
      if (!workspace || !Array.isArray(workspace.sessionIds)) continue;
      const next = workspace.sessionIds.filter((value) => value !== id);
      if (next.length !== workspace.sessionIds.length) { workspace.sessionIds = next; changed = true; }
    }
  }
  return changed;
}

async function findSessionDirs(sessions, id) {
  const found = [];
  let entries = [];
  try { entries = await fs.readdir(sessions, { withFileTypes: true }); }
  catch (error) {
    if (error && error.code === "ENOENT") return found;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(sessions, entry.name, id);
    const parent = path.dirname(dir);
    if (path.basename(dir) !== id || path.dirname(parent) !== sessions) continue;
    try {
      if ((await fs.lstat(dir)).isDirectory()) found.push(dir);
    } catch (error) {
      if (!error || error.code !== "ENOENT") throw error;
    }
  }
  return found;
}

function decompressZstdFrames(raw) {
  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  const starts = [];
  let at = 0;
  while ((at = raw.indexOf(magic, at)) >= 0) { starts.push(at); at += magic.length; }
  if (starts.length <= 1) return zlib.zstdDecompressSync(raw);
  const chunks = [];
  for (let i = 0; i < starts.length; i++) {
    const frame = raw.subarray(starts[i], starts[i + 1] ?? raw.length);
    try { chunks.push(zlib.zstdDecompressSync(frame)); }
    catch (error) {
      if (chunks.length === 0) throw error;
      // A false magic inside compressed bytes is rare; skip it and keep the
      // frames already decoded.
    }
  }
  return Buffer.concat(chunks);
}

async function readSessionLog(dir) {
  const names = [
    "session.v4.jsonl.zstd", "session.v4.jsonl.zst", "session.v4.jsonl",
    "session.jsonl.zstd", "session.jsonl.zst", "session.jsonl",
  ];
  for (const name of names) {
    const file = path.join(dir, name);
    let raw;
    try { raw = await fs.readFile(file); }
    catch (error) { if (error && error.code === "ENOENT") continue; throw error; }
    let data = raw;
    if (name.endsWith(".zstd") || name.endsWith(".zst")) {
      if (typeof zlib.zstdDecompressSync !== "function") {
        throw new Error("当前 DSH Node 不支持 zstd 解压");
      }
      data = decompressZstdFrames(raw);
    }
    return data.toString("utf8");
  }
  return null;
}

function isInside(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function normalizeToolPath(cwd, raw) {
  if (typeof raw !== "string") return null;
  let value = raw.trim();
  if (!value) return null;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (!value || value === "/dev/null") return null;
  value = value.replace(/^[ab]\//, "");
  const absolute = path.resolve(cwd, value);
  return isInside(cwd, absolute) ? absolute : null;
}

function extractWrites(text, cwd) {
  const records = new Map();
  const add = (raw, action) => {
    const absolute = normalizeToolPath(cwd, raw);
    if (!absolute) return;
    const rel = toPosix(path.relative(cwd, absolute));
    records.set(rel, { path: rel, action });
  };

  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type !== "tool/call") continue;
    const name = event.data?.name;
    let args;
    try { args = typeof event.data?.arguments === "string" ? JSON.parse(event.data.arguments) : event.data?.arguments; }
    catch { continue; }
    if (!args || typeof args !== "object") continue;

    if (name === "write" || name === "edit") {
      add(args.file_path || args.path, name);
    } else if (name === "apply_patch") {
      const patch = args.input || args.patch || "";
      for (const match of String(patch).matchAll(/^\*\*\* (?:Add|Update|Delete) File:\s*(.+)$/gm)) {
        add(match[1], "apply_patch");
      }
    }
  }
  return [...records.values()];
}

/**
 * Extract the file-write records from one session log, restricted to that
 * session's workspace. Returns relative paths; no absolute path reaches the UI.
 */
export async function scanSessionFiles(sessionId, options = {}) {
  const id = safeId(sessionId);
  if (!id) throw Object.assign(new Error("非法会话 ID"), { status: 400 });
  const { sessions } = roots(options);
  const dirs = await findSessionDirs(sessions, id);
  if (dirs.length === 0) throw Object.assign(new Error(`未找到会话 ${id}；sessionsRoot=${sessions}`), { status: 404 });

  let text = null;
  let sourceDir = null;
  let lastError = null;
  for (const dir of dirs) {
    try {
      const value = await readSessionLog(dir);
      if (value !== null) { text = value; sourceDir = dir; break; }
    } catch (error) { lastError = error; }
  }
  if (text === null) {
    throw Object.assign(new Error(lastError?.message || `会话日志不存在：${id}`), { status: 500 });
  }

  let header;
  try { header = JSON.parse(text.split(/\r?\n/, 1)[0]); } catch { header = null; }
  const cwd = typeof header?.cwd === "string" ? path.resolve(header.cwd) : null;
  if (!cwd) throw Object.assign(new Error("会话日志没有 cwd，无法限定工作区"), { status: 400 });

  let root;
  try { root = await fs.realpath(cwd); } catch { root = cwd; }
  const files = [];
  for (const record of extractWrites(text, root)) {
    const absolute = path.join(root, record.path);
    let stat;
    try { stat = await fs.lstat(absolute); }
    catch (error) { if (error && error.code === "ENOENT") continue; throw error; }
    if (!stat.isFile()) continue;
    let real;
    try { real = await fs.realpath(absolute); }
    catch { continue; }
    if (!isInside(root, real)) continue;
    files.push({ path: record.path, action: record.action, size: stat.size });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { sessionId: id, workspace: root, sourceDir, files };
}

/**
 * Delete only explicitly selected files that also appear in the session's
 * write log and still live inside its workspace.
 */
export async function deleteProjectFiles(sessionId, requested, options = {}) {
  const scan = await scanSessionFiles(sessionId, options);
  const allowed = new Map(scan.files.map((file) => [file.path, file]));
  const root = await fs.realpath(scan.workspace).catch(() => scan.workspace);
  const removed = [];
  const skipped = [];
  const warnings = [];
  const list = Array.isArray(requested) ? requested : [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    let rel = raw;
    if (path.isAbsolute(rel)) rel = path.relative(scan.workspace, rel);
    rel = toPosix(path.normalize(rel));
    if (!allowed.has(rel)) { skipped.push(rel); continue; }
    const absolute = path.resolve(scan.workspace, rel);
    try {
      const stat = await fs.lstat(absolute);
      if (!stat.isFile()) { skipped.push(rel); continue; }
      const real = await fs.realpath(absolute);
      if (!isInside(root, real)) { skipped.push(rel); continue; }
      await fs.rm(absolute, { force: true });
      removed.push(rel);
    } catch (error) {
      if (error && error.code === "ENOENT") { skipped.push(rel); continue; }
      warnings.push(`${rel}: ${error.message}`);
    }
  }
  return { removed, skipped, warnings };
}

/**
 * Reattach a restored Session to the Workspace whose path matches its header cwd.
 */
export async function reattachSession(sessionId, options = {}) {
  const id = safeId(sessionId);
  if (!id) throw Object.assign(new Error("非法会话 ID"), { status: 400 });
  if (!options.registry) throw Object.assign(new Error("Workspace registry 不可用"), { status: 500 });
  const { sessions } = roots(options);
  const dirs = await findSessionDirs(sessions, id);
  if (dirs.length === 0) throw Object.assign(new Error(`未找到会话目录 ${id}`), { status: 404 });

  let cwd = null;
  for (const dir of dirs) {
    const text = await readSessionLog(dir).catch(() => null);
    if (!text) continue;
    try {
      const header = JSON.parse(text.split(/\r?\n/, 1)[0]);
      if (typeof header.cwd === "string") { cwd = header.cwd; break; }
    } catch { /* try the next directory */ }
  }
  if (!cwd) throw Object.assign(new Error("会话 header 没有 cwd，无法归组"), { status: 400 });

  let realCwd;
  try { realCwd = await fs.realpath(cwd); } catch { realCwd = path.resolve(cwd); }
  const canonical = (value) => {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  const workspace = options.registry.list().find((candidate) => {
    try { return canonical(candidate.path) === canonical(realCwd); } catch { return false; }
  });
  if (!workspace) {
    throw Object.assign(new Error(`没有路径匹配 ${realCwd} 的 Workspace`), { status: 404 });
  }
  if (Array.isArray(workspace.sessionIds) && workspace.sessionIds.includes(id)) {
    return { sessionId: id, workspaceId: workspace.id, workspacePath: workspace.path, alreadyAttached: true };
  }
  await workspace.attachSession(id);
  return { sessionId: id, workspaceId: workspace.id, workspacePath: workspace.path, alreadyAttached: false };
}

/**
 * Reattach Sessions that this plugin deleted with file retention, once their
 * log directory has been moved back into `sessions/`.
 */
export async function restoreMarkedSessions(options = {}) {
  if (!options.registry) return { attached: [], skipped: [] };
  const { sessions } = roots(options);
  const deletedRoot = path.join(options.keptRoot || path.dirname(sessions), "deleted-sessions");
  let entries = [];
  try { entries = await fs.readdir(deletedRoot, { withFileTypes: true }); }
  catch (error) { if (error && error.code === "ENOENT") return { attached: [], skipped: [] }; throw error; }

  const attached = [];
  const skipped = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const markerFile = path.join(deletedRoot, entry.name, ".session-delete.json");
    let marker;
    try { marker = JSON.parse(await fs.readFile(markerFile, "utf8")); }
    catch { continue; }
    const id = safeId(marker.sessionId);
    if (!id) continue;
    try {
      if ((await findSessionDirs(sessions, id)).length === 0) { skipped.push({ id, reason: "not-restored" }); continue; }
      const result = await reattachSession(id, options);
      attached.push(result);
      await fs.rm(markerFile, { force: true });
    } catch (error) {
      skipped.push({ id, reason: error.message });
    }
  }
  return { attached, skipped };
}

/**
 * Delete one session from disk and from the workspace index.
 * Exported so it can be tested without mounting the Host plugin.
 */
export async function deleteSessionData(sessionId, options = {}) {
  const id = safeId(sessionId);
  if (!id) throw Object.assign(new Error("非法会话 ID"), { status: 400 });
  const { sessions, storages } = roots(options);
  const keepFiles = options.deleteFiles === false;
  const result = {
    id, deleteFiles: !keepFiles, removedDirs: [], keptDirs: [], removedCaches: [],
    workspaceUpdated: false, warnings: [], sessionsRoot: sessions,
  };
  const keptRoot = keepFiles ? path.join(options.keptRoot || path.dirname(sessions), "deleted-sessions", `${id}-${Date.now()}`) : null;
  let ownerWorkspace = null;
  if (options.registry && typeof options.registry.list === "function") {
    try {
      ownerWorkspace = options.registry.list().find((workspace) => Array.isArray(workspace.sessionIds) && workspace.sessionIds.includes(id)) || null;
    } catch { /* registry availability is optional for the fallback path */ }
  }

  let projectResult = null;
  if (Array.isArray(options.projectFiles) && options.projectFiles.length > 0) {
    projectResult = await deleteProjectFiles(id, options.projectFiles, options);
    result.projectFiles = projectResult;
  }

  const dirs = await findSessionDirs(sessions, id);
  let foundSessionDirs = dirs.length;
  for (const dir of dirs) {
    try {
      if (keepFiles) {
        const target = path.join(keptRoot, path.basename(path.dirname(dir)), id);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.rename(dir, target);
        result.keptDirs.push(target);
      } else {
        await fs.rm(dir, { recursive: true, force: true, maxRetries: 5 });
        const remains = await fs.lstat(dir).then(() => true).catch(() => false);
        if (remains) throw new Error(`目录仍存在：${dir}`);
        result.removedDirs.push(dir);
      }
    } catch (error) {
      if (error && error.code === "ENOENT") continue;
      result.warnings.push(`${keepFiles ? "移动" : "删除"} ${dir} 失败：${error.message}`);
    }
  }

  if (keepFiles && keptRoot && result.keptDirs.length > 0) {
    try {
      await fs.mkdir(keptRoot, { recursive: true });
      await writeJsonAtomic(path.join(keptRoot, ".session-delete.json"), {
        version: 1,
        sessionId: id,
        workspaceId: ownerWorkspace?.id ?? null,
        workspacePath: ownerWorkspace?.path ?? null,
        deletedAt: new Date().toISOString(),
        keptDirs: result.keptDirs,
      });
      result.restoreMarker = path.join(keptRoot, ".session-delete.json");
    } catch (error) {
      result.warnings.push(`写入恢复标记失败：${error.message}`);
    }
  }

  const cache = path.join(storages, "session_projcache", "sessions", `${id}.json`);  try {
    await fs.rm(cache, { force: false });
    result.removedCaches.push(cache);
  } catch (error) {
    if (!error || error.code !== "ENOENT") result.warnings.push(`删除投影缓存失败：${error.message}`);
  }

  // Preferred: mutate the live Workspace registry so the sidebar updates without
  // restarting DSH. Fall back to the durable file for unit tests/older hosts.
  let registryDetached = false;
  if (options.registry && typeof options.registry.list === "function") {
    try {
      for (const workspace of options.registry.list()) {
        if (Array.isArray(workspace.sessionIds) && workspace.sessionIds.includes(id)) {
          await workspace.detachSession(id);
          registryDetached = true;
        }
      }
      if (registryDetached) result.workspaceUpdated = true;
    } catch (error) {
      result.warnings.push(`更新 Workspace registry 失败：${error.message}`);
    }
  }
  if (!registryDetached) {
    const workspaceFile = path.join(storages, "workspace.json");
    try {
      const workspace = await readJson(workspaceFile, null);
      if (workspace && removeSessionRefs(workspace, id)) {
        await writeJsonAtomic(workspaceFile, workspace);
        result.workspaceUpdated = true;
      }
    } catch (error) {
      result.warnings.push(`更新 workspace.json 失败：${error.message}`);
    }
  }

  if (result.removedDirs.length === 0 && result.keptDirs.length === 0 && result.removedCaches.length === 0 && !result.workspaceUpdated && !projectResult) {
    throw Object.assign(new Error(`未找到会话 ${id}；sessionsRoot=${sessions}`), { status: 404 });
  }
  if (keepFiles && foundSessionDirs > 0 && result.keptDirs.length === 0) {
    throw Object.assign(new Error(`会话目录保留失败：${result.warnings.join('；') || '未知原因'}`), { status: 500 });
  }
  if (result.deleteFiles && foundSessionDirs > 0 && result.removedDirs.length === 0) {
    throw Object.assign(new Error(`会话目录删除失败：${result.warnings.join('；') || '未知原因'}`), { status: 500 });
  }
  return result;
}

async function handleScan(request, config) {
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "请求体不是 JSON" }, { status: 400 }); }
  try {
    return Response.json({ ok: true, result: await scanSessionFiles(body && body.sessionId, config) });
  } catch (error) {
    const status = error && Number.isInteger(error.status) ? error.status : 500;
    return Response.json({ ok: false, error: error && error.message ? error.message : String(error) }, { status });
  }
}

async function handleInfo(_request, config) {
  const { home, sessions, storages } = roots(config);
  return Response.json({ ok: true, result: { home, sessionsRoot: sessions, storagesRoot: storages } });
}

async function handleReattach(request, config) {
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "请求体不是 JSON" }, { status: 400 }); }
  try {
    const result = await reattachSession(body && body.sessionId, { ...config, registry: config.registry });
    return Response.json({ ok: true, result });
  } catch (error) {
    const status = error && Number.isInteger(error.status) ? error.status : 500;
    return Response.json({ ok: false, error: error && error.message ? error.message : String(error) }, { status });
  }
}

async function handleDelete(request, config) {
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "请求体不是 JSON" }, { status: 400 }); }
  try {
    const result = await deleteSessionData(body && body.sessionId, {
      ...config,
      deleteFiles: body && body.deleteFiles !== false,
      projectFiles: body && Array.isArray(body.projectFiles) ? body.projectFiles : [],
    });
    return Response.json({ ok: true, result });
  } catch (error) {
    const status = error && Number.isInteger(error.status) ? error.status : 500;
    return Response.json({ ok: false, error: error && error.message ? error.message : String(error) }, { status });
  }
}

export const inject = ["connection", "workspaceRegistry"];

export function apply(ctx, config = {}) {
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: "/api/session-delete/info",
      methods: ["GET"],
      requestBody: "buffered",
      fetch: (request) => handleInfo(request, config),
    }),
    "session-delete: GET /api/session-delete/info",
  );
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: "/api/session-delete/scan",
      methods: ["POST"],
      requestBody: "buffered",
      fetch: (request) => handleScan(request, config),
    }),
    "session-delete: POST /api/session-delete/scan",
  );
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: "/api/session-delete/reattach",
      methods: ["POST"],
      requestBody: "buffered",
      fetch: (request) => handleReattach(request, { ...config, registry: ctx.workspaceRegistry }),
    }),
    "session-delete: POST /api/session-delete/reattach",
  );
  ctx.effect(
    () => {
      const timer = setTimeout(() => {
        restoreMarkedSessions({ ...config, registry: ctx.workspaceRegistry }).catch((error) => {
          ctx.logger?.warn?.(`session-delete restore marked sessions failed: ${error}`);
        });
      }, 1200);
      return () => clearTimeout(timer);
    },
    "session-delete: restore marked sessions",
  );
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: "/api/session-delete",
      methods: ["POST"],
      requestBody: "buffered",
      fetch: (request) => handleDelete(request, { ...config, registry: ctx.workspaceRegistry }),
    }),
    "session-delete: POST /api/session-delete",
  );
}

import { promises as fs } from "node:fs";
import path from "node:path";

const ID_RE = /^(?:session-)?[A-Za-z0-9][A-Za-z0-9._-]{5,120}$/;
const ROUTE = "/api/session-delete";

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

/**
 * Delete one session from disk and from the workspace index.
 * Exported so it can be tested without mounting the Host plugin.
 */
export async function deleteSessionData(sessionId, options = {}) {
  const id = safeId(sessionId);
  if (!id) throw Object.assign(new Error("非法会话 ID"), { status: 400 });
  const { home, sessions, storages } = roots(options);
  const keepFiles = options.deleteFiles === false;
  const result = { id, deleteFiles: !keepFiles, removedDirs: [], keptDirs: [], removedCaches: [], workspaceUpdated: false, warnings: [], sessionsRoot: sessions };
  const keptRoot = keepFiles ? path.join(home, "deleted-sessions", `${id}-${Date.now()}`) : null;

  let entries = [];
  let foundSessionDirs = 0;
  try { entries = await fs.readdir(sessions, { withFileTypes: true }); }
  catch (error) {
    if (error && error.code !== "ENOENT") throw error;
    result.warnings.push("sessions 目录不存在");
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(sessions, entry.name, id);
    const parent = path.dirname(dir);
    if (path.basename(dir) !== id || path.dirname(parent) !== sessions) continue;
    try {
      const stat = await fs.lstat(dir);
      if (!stat.isDirectory()) continue;
      foundSessionDirs += 1;
      if (keepFiles) {
        const target = path.join(keptRoot, entry.name, id);
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

  const cache = path.join(storages, "session_projcache", "sessions", `${id}.json`);
  try {
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

  const foundDirs = result.removedDirs.length + result.keptDirs.length;
  if (foundDirs === 0 && result.removedCaches.length === 0 && !result.workspaceUpdated) {
    throw Object.assign(new Error(`未找到会话 ${id}；sessionsRoot=${sessions}`), { status: 404 });
  }
  if (result.deleteFiles && foundSessionDirs > 0 && result.removedDirs.length === 0) {
    throw Object.assign(new Error(`会话目录删除失败：${result.warnings.join('；') || '未知原因'}`), { status: 500 });
  }
  return result;
}

async function handleDelete(request, config) {
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "请求体不是 JSON" }, { status: 400 }); }
  try {
    const result = await deleteSessionData(body && body.sessionId, {
      ...config,
      deleteFiles: body && body.deleteFiles !== false,
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
      path: "/api/session-delete",
      methods: ["POST"],
      requestBody: "buffered",
      fetch: (request) => handleDelete(request, { ...config, registry: ctx.workspaceRegistry }),
    }),
    "session-delete: POST /api/session-delete",
  );
}

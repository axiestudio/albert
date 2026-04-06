/**
 * Web Research Agent — Browser Use Cloud API v2 client.
 *
 * Two-phase tool pattern:
 *   Phase 1: startTask() — creates task, returns immediately with taskId + liveUrl
 *   Phase 2: waitForTask() — polls until finished, downloads output files
 *
 * API key is provided per-request via the executive law request body.
 * It is NEVER stored server-side.
 */

const BROWSER_USE_API_BASE = "https://api.browser-use.com/api/v2";
const BROWSER_USE_TASK_TIMEOUT_MS = 180_000;
const BROWSER_USE_INITIAL_POLL_INTERVAL_MS = 5_000;
const BROWSER_USE_MAX_POLL_INTERVAL_MS = 12_000;
const BROWSER_USE_MAX_STEPS = 50;
const BROWSER_USE_MAX_DOWNLOADED_FILES = 3;
const BROWSER_USE_DEFAULT_READ_CHARS = 12_000;
const BROWSER_USE_MAX_READ_CHARS = 20_000;

// ─── Types ──────────────────────────────────────────────────────────────────

export type BrowserUseTaskStatus = "started" | "paused" | "finished" | "stopped";

export type BrowserUseStep = {
  number: number;
  memory: string;
  evaluationPreviousGoal: string;
  nextGoal: string;
  url: string;
  screenshotUrl?: string;
  actions: string[];
};

export type OutputFile = {
  id: string;
  fileName: string;
};

export type BrowserUseTaskResult = {
  id: string;
  sessionId: string;
  status: BrowserUseTaskStatus;
  output?: string;
  isSuccess?: boolean;
  steps: BrowserUseStep[];
  outputFiles: OutputFile[];
  error?: string;
  fileContents?: Array<{ fileName: string; content: string }>;
};

export type BrowserUseOutputFileChunk = {
  fileName: string;
  content: string;
  startOffset: number;
  endOffsetExclusive: number;
  nextOffset: number | null;
  isComplete: boolean;
  totalChars: number;
};

export type StartTaskResult = {
  taskId: string;
  sessionId: string;
  liveUrl: string | null;
};

// ─── API helpers ────────────────────────────────────────────────────────────

async function apiRequest<T>(
  path: string,
  apiKey: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${BROWSER_USE_API_BASE}${path}`, {
    ...options,
    headers: {
      "X-Browser-Use-API-Key": apiKey,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Web Research API: ${response.status} ${response.statusText} — ${text}`);
  }
  return await response.json() as T;
}

function requireNonEmptyBrowserUseValue(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Browser Use ${label} is required`);
  }
  return normalized;
}

function normalizeAllowedDomain(domain: string): string | null {
  const trimmed = domain.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = trimmed.includes("://")
      ? new URL(trimmed)
      : new URL(`https://${trimmed}`);
    return url.hostname.toLowerCase();
  } catch {
    const normalized = trimmed
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
    return normalized || null;
  }
}

function normalizeBrowserUseOptions(options?: {
  startUrl?: string;
  maxSteps?: number;
  allowedDomains?: string[];
}): {
    startUrl?: string;
    maxSteps: number;
    allowedDomains?: string[];
  } {
  const rawMaxSteps = Number.isFinite(options?.maxSteps) ? Math.trunc(options!.maxSteps!) : 30;
  const maxSteps = Math.min(Math.max(rawMaxSteps, 1), BROWSER_USE_MAX_STEPS);
  const startUrl = options?.startUrl?.trim() || undefined;
  const allowedDomains = Array.from(
    new Set(
      (options?.allowedDomains ?? [])
        .map(normalizeAllowedDomain)
        .filter((domain): domain is string => Boolean(domain)),
    ),
  );

  return {
    ...(startUrl ? { startUrl } : {}),
    maxSteps,
    ...(allowedDomains.length > 0 ? { allowedDomains } : {}),
  };
}

// ─── Create a task ──────────────────────────────────────────────────────────

async function createTask(
  apiKey: string,
  task: string,
  options?: {
    startUrl?: string;
    maxSteps?: number;
    allowedDomains?: string[];
  },
): Promise<{ id: string; sessionId: string }> {
  const normalizedApiKey = requireNonEmptyBrowserUseValue(apiKey, "API key");
  const normalizedTask = requireNonEmptyBrowserUseValue(task, "task");
  const normalizedOptions = normalizeBrowserUseOptions(options);

  return apiRequest<{ id: string; sessionId: string }>("/tasks", normalizedApiKey, {
    method: "POST",
    body: JSON.stringify({
      task: normalizedTask,
      llm: "browser-use-llm",
      startUrl: normalizedOptions.startUrl,
      maxSteps: normalizedOptions.maxSteps,
      allowedDomains: normalizedOptions.allowedDomains,
      vision: "auto",
    }),
  });
}

// ─── Get task status ────────────────────────────────────────────────────────

async function getTask(
  apiKey: string,
  taskId: string,
): Promise<BrowserUseTaskResult> {
  const data = await apiRequest<{
    id: string;
    sessionId: string;
    status: BrowserUseTaskStatus;
    output?: string;
    isSuccess?: boolean;
    steps: BrowserUseStep[];
    outputFiles?: OutputFile[];
  }>(`/tasks/${taskId}`, apiKey);

  return {
    id: data.id,
    sessionId: data.sessionId,
    status: data.status,
    output: data.output ?? undefined,
    isSuccess: data.isSuccess ?? undefined,
    steps: data.steps ?? [],
    outputFiles: data.outputFiles ?? [],
  };
}

// ─── Get output file download URL ───────────────────────────────────────────

async function getOutputFileUrl(
  apiKey: string,
  taskId: string,
  fileId: string,
): Promise<string> {
  const data = await apiRequest<{ downloadUrl: string }>(
    `/files/tasks/${taskId}/output-files/${fileId}`,
    apiKey,
  );
  return data.downloadUrl;
}

async function downloadFileContent(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return `[Download failed: HTTP ${res.status}]`;
    return await res.text();
  } catch {
    clearTimeout(timer);
    return "[Download failed]";
  }
}

function prioritizeOutputFiles(files: OutputFile[]): OutputFile[] {
  const ranked = [...files];
  ranked.sort((left, right) => {
    const leftScore = /report|summary|result|findings/i.test(left.fileName) ? 0 : 1;
    const rightScore = /report|summary|result|findings/i.test(right.fileName) ? 0 : 1;
    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }

    return left.fileName.localeCompare(right.fileName);
  });
  return ranked;
}

function clampOutputReadOffset(offset?: number): number {
  if (!Number.isFinite(offset)) {
    return 0;
  }

  return Math.max(0, Math.trunc(offset!));
}

function clampOutputReadChars(maxChars?: number): number {
  if (!Number.isFinite(maxChars)) {
    return BROWSER_USE_DEFAULT_READ_CHARS;
  }

  return Math.min(Math.max(1, Math.trunc(maxChars!)), BROWSER_USE_MAX_READ_CHARS);
}

// ─── Get session live URL ───────────────────────────────────────────────────

async function getSessionLiveUrl(
  apiKey: string,
  sessionId: string,
): Promise<string | null> {
  const data = await apiRequest<{ liveUrl?: string }>(`/sessions/${sessionId}`, apiKey);
  return data.liveUrl ?? null;
}

// ─── Stop a task ────────────────────────────────────────────────────────────

async function stopTask(
  apiKey: string,
  taskId: string,
): Promise<void> {
  await apiRequest(`/tasks/${taskId}`, apiKey, {
    method: "PATCH",
    body: JSON.stringify({ action: "stop_task_and_session" }),
  });
}

// ─── Phase 1: Start task and return immediately with live URL ───────────────

export async function startBrowserTask(
  apiKey: string,
  task: string,
  options?: {
    startUrl?: string;
    maxSteps?: number;
    allowedDomains?: string[];
  },
): Promise<StartTaskResult> {
  const normalizedApiKey = requireNonEmptyBrowserUseValue(apiKey, "API key");
  const { id: taskId, sessionId } = await createTask(normalizedApiKey, task, options);

  let liveUrl: string | null = null;
  try {
    liveUrl = await getSessionLiveUrl(normalizedApiKey, sessionId);
  } catch { /* non-critical */ }

  return { taskId, sessionId, liveUrl };
}

// ─── Phase 2: Wait for an existing task to finish ───────────────────────────

export async function waitForBrowserTask(
  apiKey: string,
  taskId: string,
): Promise<BrowserUseTaskResult> {
  const normalizedApiKey = requireNonEmptyBrowserUseValue(apiKey, "API key");
  const normalizedTaskId = requireNonEmptyBrowserUseValue(taskId, "task ID");
  const deadline = Date.now() + BROWSER_USE_TASK_TIMEOUT_MS;
  let result: BrowserUseTaskResult;
  let pollDelayMs = BROWSER_USE_INITIAL_POLL_INTERVAL_MS;

  while (Date.now() < deadline) {
    result = await getTask(normalizedApiKey, normalizedTaskId);

    if (result.status === "finished" || result.status === "stopped") {
      if (result.outputFiles.length > 0) {
        result.fileContents = [];
        for (const file of prioritizeOutputFiles(result.outputFiles).slice(0, BROWSER_USE_MAX_DOWNLOADED_FILES)) {
          try {
            const url = await getOutputFileUrl(normalizedApiKey, normalizedTaskId, file.id);
            const content = await downloadFileContent(url);
            result.fileContents.push({ fileName: file.fileName, content });
          } catch { /* non-critical */ }
        }
      }
      return result;
    }

    await new Promise((r) => setTimeout(r, pollDelayMs));
    pollDelayMs = Math.min(Math.ceil(pollDelayMs * 1.5), BROWSER_USE_MAX_POLL_INTERVAL_MS);
  }

  // Timeout — stop the task and return what we have
  try {
    await stopTask(normalizedApiKey, normalizedTaskId);
  } catch { /* best effort */ }

  result = await getTask(normalizedApiKey, normalizedTaskId);
  result.error = "Task timed out after 3 minutes";
  return result;
}

export async function readBrowserTaskOutputFile(
  apiKey: string,
  taskId: string,
  fileName: string,
  options?: {
    offset?: number;
    maxChars?: number;
  },
): Promise<BrowserUseOutputFileChunk> {
  const normalizedApiKey = requireNonEmptyBrowserUseValue(apiKey, "API key");
  const normalizedTaskId = requireNonEmptyBrowserUseValue(taskId, "task ID");
  const normalizedFileName = requireNonEmptyBrowserUseValue(fileName, "output file name").toLowerCase();

  const task = await getTask(normalizedApiKey, normalizedTaskId);
  const matchedFile = prioritizeOutputFiles(task.outputFiles)
    .find(file => file.fileName.trim().toLowerCase() === normalizedFileName);

  if (!matchedFile) {
    throw new Error(`Web Research output file not found: ${fileName}`);
  }

  const downloadUrl = await getOutputFileUrl(normalizedApiKey, normalizedTaskId, matchedFile.id);
  const fullContent = await downloadFileContent(downloadUrl);
  const startOffset = clampOutputReadOffset(options?.offset);
  const maxChars = clampOutputReadChars(options?.maxChars);
  const content = fullContent.slice(startOffset, startOffset + maxChars);
  const endOffsetExclusive = startOffset + content.length;

  return {
    fileName: matchedFile.fileName,
    content,
    startOffset,
    endOffsetExclusive,
    nextOffset: endOffsetExclusive < fullContent.length ? endOffsetExclusive : null,
    isComplete: endOffsetExclusive >= fullContent.length,
    totalChars: fullContent.length,
  };
}

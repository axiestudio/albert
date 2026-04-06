/**
 * Web Research Agent — cloud browser automation API client.
 *
 * The API key is provided by the user at runtime (client-side input),
 * forwarded to the server via the `x-browser-use-key` header,
 * and used here to drive a remote browser for deep legal research.
 */

const API_BASE = "https://api.browser-use.com/api/v2";
const TASK_TIMEOUT_MS = 180_000; // 3 min max poll time
const POLL_INTERVAL_MS = 3_000;

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
  /** Downloaded markdown/text content from output files */
  fileContents?: Array<{ fileName: string; content: string }>;
};

// ─── API helpers ────────────────────────────────────────────────────────────

async function apiRequest<T>(
  path: string,
  apiKey: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
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

// ─── Create a task ──────────────────────────────────────────────────────────

export async function createTask(
  apiKey: string,
  task: string,
  options?: {
    startUrl?: string;
    maxSteps?: number;
    allowedDomains?: string[];
  },
): Promise<{ id: string; sessionId: string }> {
  return apiRequest<{ id: string; sessionId: string }>("/tasks", apiKey, {
    method: "POST",
    body: JSON.stringify({
      task,
      llm: "browser-use-llm",
      startUrl: options?.startUrl,
      maxSteps: options?.maxSteps ?? 30,
      allowedDomains: options?.allowedDomains,
      vision: "auto",
    }),
  });
}

// ─── Get task status ────────────────────────────────────────────────────────

export async function getTask(
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

// ─── Get session live URL ───────────────────────────────────────────────────

export async function getSessionLiveUrl(
  apiKey: string,
  sessionId: string,
): Promise<string | null> {
  const data = await apiRequest<{ liveUrl?: string }>(`/sessions/${sessionId}`, apiKey);
  return data.liveUrl ?? null;
}

// ─── Stop a task ────────────────────────────────────────────────────────────

export async function stopTask(
  apiKey: string,
  taskId: string,
): Promise<void> {
  await apiRequest(`/tasks/${taskId}`, apiKey, {
    method: "PATCH",
    body: JSON.stringify({ action: "stop_task_and_session" }),
  });
}

// ─── Phase 1: Start task and return immediately with live URL ───────────────

export type StartTaskResult = {
  taskId: string;
  sessionId: string;
  liveUrl: string | null;
};

export async function startTask(
  apiKey: string,
  task: string,
  options?: {
    startUrl?: string;
    maxSteps?: number;
    allowedDomains?: string[];
  },
): Promise<StartTaskResult> {
  const { id: taskId, sessionId } = await createTask(apiKey, task, options);

  let liveUrl: string | null = null;
  try {
    liveUrl = await getSessionLiveUrl(apiKey, sessionId);
  } catch { /* non-critical */ }

  return { taskId, sessionId, liveUrl };
}

// ─── Phase 2: Wait for an existing task to finish ───────────────────────────

export async function waitForTask(
  apiKey: string,
  taskId: string,
): Promise<BrowserUseTaskResult> {
  const deadline = Date.now() + TASK_TIMEOUT_MS;
  let result: BrowserUseTaskResult;

  while (Date.now() < deadline) {
    result = await getTask(apiKey, taskId);

    if (result.status === "finished" || result.status === "stopped") {
      // Download any output files (markdown, text, etc.)
      if (result.outputFiles.length > 0) {
        result.fileContents = [];
        for (const file of result.outputFiles.slice(0, 5)) {
          try {
            const url = await getOutputFileUrl(apiKey, taskId, file.id);
            const content = await downloadFileContent(url);
            result.fileContents.push({ fileName: file.fileName, content });
          } catch { /* non-critical */ }
        }
      }
      return result;
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  // Timeout — stop the task and return what we have
  try {
    await stopTask(apiKey, taskId);
  } catch { /* best effort */ }

  result = await getTask(apiKey, taskId);
  result.error = "Task timed out after 3 minutes";
  return result;
}

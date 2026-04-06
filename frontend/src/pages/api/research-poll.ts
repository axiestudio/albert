/**
 * ✅ 2026 Research Poll Endpoint — Proxies Browser Use task status
 *
 * The Canvas polls this endpoint to check if a research task has finished.
 * This keeps the Browser Use API URL and protocol hidden from the client.
 *
 * White-label: The client never sees "browser-use.com" — only "/api/research-poll"
 */

import type { APIRoute } from "astro";

const BROWSER_USE_API_BASE = "https://api.browser-use.com/api/v2";

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const taskId = url.searchParams.get("taskId");
  const apiKey = request.headers.get("x-browser-use-key");

  if (!taskId || !apiKey) {
    return Response.json({ error: "Missing taskId or API key" }, { status: 400 });
  }

  // Validate taskId format (UUID only — prevent injection)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskId)) {
    return Response.json({ error: "Invalid taskId format" }, { status: 400 });
  }

  try {
    const res = await fetch(`${BROWSER_USE_API_BASE}/tasks/${taskId}`, {
      headers: {
        "X-Browser-Use-API-Key": apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      return Response.json(
        { error: `Upstream error: ${res.status}` },
        { status: res.status },
      );
    }

    const data = await res.json() as Record<string, unknown>;

    // Return only what the Canvas needs — strip internal details
    return Response.json({
      status: data.status,
      output: data.output,
      isSuccess: data.isSuccess,
      steps: Array.isArray(data.steps) ? data.steps.map((s: Record<string, unknown>) => ({
        number: s.number,
        url: s.url,
        nextGoal: s.nextGoal,
      })) : [],
      outputFiles: Array.isArray(data.outputFiles) ? data.outputFiles.map((f: Record<string, unknown>) => ({
        id: f.id,
        fileName: f.fileName,
      })) : [],
    });
  } catch (err) {
    return Response.json(
      { error: "Failed to poll research status" },
      { status: 502 },
    );
  }
};

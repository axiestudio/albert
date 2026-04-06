import type { APIRoute } from "astro";

type RuntimeEnv = Record<string, string | undefined>;

type EndpointHandler = (request: Request, env?: RuntimeEnv) => Promise<Response>;

export function createAstroEndpointHandlers(handler: EndpointHandler) {
  const handleRequest: APIRoute = ({ request, locals }) => {
    const env = (locals as { runtime?: { env?: RuntimeEnv } }).runtime?.env;
    return handler(request, env);
  };

  return {
    DELETE: handleRequest,
    GET: handleRequest,
    HEAD: handleRequest,
    OPTIONS: handleRequest,
    PATCH: handleRequest,
    POST: handleRequest,
    PUT: handleRequest,
  };
}
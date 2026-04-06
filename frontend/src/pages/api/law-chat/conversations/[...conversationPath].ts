import platformHandler from "@/api/platform";
import { createAstroEndpointHandlers } from "@/pages/api/_utils";

const handlers = createAstroEndpointHandlers(platformHandler);

export const DELETE = handlers.DELETE;
export const GET = handlers.GET;
export const HEAD = handlers.HEAD;
export const OPTIONS = handlers.OPTIONS;
export const PATCH = handlers.PATCH;
export const POST = handlers.POST;
export const PUT = handlers.PUT;

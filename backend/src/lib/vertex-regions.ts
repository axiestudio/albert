/**
 * ✅ 2026 Vertex AI Region Configuration
 *
 * Comprehensive mapping of all Vertex AI regions with geo-routing
 * to resolve the nearest region based on user latitude/longitude.
 *
 * Two endpoint styles:
 *   1. Regional: https://{LOCATION}-aiplatform.googleapis.com/...
 *   2. Global:   https://aiplatform.googleapis.com/...  (location = "global")
 *   3. Express:  https://aiplatform.googleapis.com/v1/publishers/google (no project/location)
 *
 * Partner models (Claude, Mistral) use regional endpoints only.
 * Google models (Gemini) support both regional + global + express mode.
 */

// ─── Region Definitions ────────────────────────────────────────────────────────

export type VertexRegion = {
  /** Vertex AI location identifier (e.g. "europe-west1") */
  id: string;
  /** Human-readable label */
  label: string;
  /** Approximate latitude of the data center */
  lat: number;
  /** Approximate longitude of the data center */
  lng: number;
  /** Continent grouping for fallback logic */
  continent: "americas" | "europe" | "asia-pacific" | "middle-east";
};

/**
 * All Vertex AI Generative AI regions (as of April 2026).
 * Coordinates are approximate data center locations for geo-distance calculation.
 */
export const VERTEX_REGIONS: readonly VertexRegion[] = [
  // ── Americas ──────────────────────────────────────────────────────────────
  { id: "us-central1",        label: "Iowa, USA",                lat: 41.26,  lng: -95.86,  continent: "americas" },
  { id: "us-east1",           label: "South Carolina, USA",      lat: 33.84,  lng: -81.16,  continent: "americas" },
  { id: "us-east4",           label: "Virginia, USA",            lat: 39.01,  lng: -77.46,  continent: "americas" },
  { id: "us-east5",           label: "Columbus, Ohio, USA",      lat: 39.96,  lng: -82.99,  continent: "americas" },
  { id: "us-west1",           label: "Oregon, USA",              lat: 45.59,  lng: -122.59, continent: "americas" },
  { id: "us-west4",           label: "Las Vegas, USA",           lat: 36.08,  lng: -115.17, continent: "americas" },
  { id: "us-south1",          label: "Dallas, USA",              lat: 32.78,  lng: -96.80,  continent: "americas" },
  { id: "northamerica-northeast1", label: "Montréal, Canada",    lat: 45.50,  lng: -73.55,  continent: "americas" },
  { id: "southamerica-east1", label: "São Paulo, Brazil",        lat: -23.55, lng: -46.63,  continent: "americas" },

  // ── Europe ────────────────────────────────────────────────────────────────
  { id: "europe-west1",       label: "Belgium",                  lat: 50.44,  lng: 3.87,    continent: "europe" },
  { id: "europe-west2",       label: "London, UK",               lat: 51.51,  lng: -0.13,   continent: "europe" },
  { id: "europe-west3",       label: "Frankfurt, Germany",       lat: 50.11,  lng: 8.68,    continent: "europe" },
  { id: "europe-west4",       label: "Netherlands",              lat: 53.45,  lng: 6.73,    continent: "europe" },
  { id: "europe-west6",       label: "Zürich, Switzerland",      lat: 47.37,  lng: 8.54,    continent: "europe" },
  { id: "europe-west8",       label: "Milan, Italy",             lat: 45.46,  lng: 9.19,    continent: "europe" },
  { id: "europe-west9",       label: "Paris, France",            lat: 48.86,  lng: 2.35,    continent: "europe" },
  { id: "europe-north1",      label: "Finland",                  lat: 60.57,  lng: 27.19,   continent: "europe" },
  { id: "europe-southwest1",  label: "Madrid, Spain",            lat: 40.42,  lng: -3.70,   continent: "europe" },

  // ── Asia Pacific ──────────────────────────────────────────────────────────
  { id: "asia-east1",         label: "Taiwan",                   lat: 24.03,  lng: 120.69,  continent: "asia-pacific" },
  { id: "asia-east2",         label: "Hong Kong",                lat: 22.31,  lng: 114.17,  continent: "asia-pacific" },
  { id: "asia-northeast1",    label: "Tokyo, Japan",             lat: 35.68,  lng: 139.69,  continent: "asia-pacific" },
  { id: "asia-northeast3",    label: "Seoul, South Korea",       lat: 37.57,  lng: 126.98,  continent: "asia-pacific" },
  { id: "asia-south1",        label: "Mumbai, India",            lat: 19.08,  lng: 72.88,   continent: "asia-pacific" },
  { id: "asia-southeast1",    label: "Singapore",                lat: 1.35,   lng: 103.82,  continent: "asia-pacific" },
  { id: "asia-southeast2",    label: "Jakarta, Indonesia",       lat: -6.21,  lng: 106.85,  continent: "asia-pacific" },
  { id: "australia-southeast1", label: "Sydney, Australia",       lat: -33.87, lng: 151.21,  continent: "asia-pacific" },

  // ── Middle East ───────────────────────────────────────────────────────────
  { id: "me-west1",           label: "Tel Aviv, Israel",         lat: 32.07,  lng: 34.78,   continent: "middle-east" },
  { id: "me-central1",        label: "Doha, Qatar",              lat: 25.29,  lng: 51.53,   continent: "middle-east" },
  { id: "me-central2",        label: "Dammam, Saudi Arabia",     lat: 26.39,  lng: 50.10,   continent: "middle-east" },
] as const;

// ─── Model-Specific Region Availability ────────────────────────────────────────

/**
 * Regions where Claude models are available on Vertex AI (as of April 2026).
 * Source: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/partner-models/claude/use-claude
 *
 * Regional: us-east5, europe-west1, asia-southeast1
 * Global endpoint also supported for all current Claude models.
 */
export const CLAUDE_AVAILABLE_REGIONS = [
  "us-east5",
  "europe-west1",
  "asia-southeast1",
] as const;

/** Claude models that support the global endpoint (higher availability, auto-routing). */
export const CLAUDE_GLOBAL_CAPABLE = true;

/**
 * Regions where Mistral models are available on Vertex AI.
 */
export const MISTRAL_AVAILABLE_REGIONS = [
  "us-central1",
  "europe-west4",
] as const;

/**
 * Regions where open models (DeepSeek, Llama, Qwen, etc.) are available on Vertex AI.
 * Regional endpoints. Some models also support global (see OPEN_MODEL_GLOBAL_IDS).
 */
export const OPEN_MODEL_AVAILABLE_REGIONS = [
  "us-central1",
  "europe-west4",
] as const;

/** Open model IDs that support the global endpoint (per docs 2026-04-02). */
export const OPEN_MODEL_GLOBAL_IDS = new Set([
  "deepseek-v3.2-maas",
  "qwen3-235b-a22b-instruct-2507-maas",
]);

/**
 * Gemini models are available in most regions + global endpoint.
 * For Express Mode (API key auth), only the global endpoint is used.
 */
export const GEMINI_EXPRESS_REGIONS = ["global"] as const;

// ─── Geo-Distance Calculation ──────────────────────────────────────────────────

/**
 * Haversine distance in kilometers between two lat/lng points.
 */
function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find the nearest Vertex AI region from a set of allowed regions
 * given the user's latitude/longitude.
 *
 * @param lat  User latitude
 * @param lng  User longitude
 * @param allowedRegionIds  Region IDs to pick from (e.g. CLAUDE_AVAILABLE_REGIONS)
 * @returns The closest region ID, or the first allowed region as fallback
 */
export function findNearestVertexRegion(
  lat: number,
  lng: number,
  allowedRegionIds: readonly string[],
): string {
  if (allowedRegionIds.length === 0) {
    return "us-east5";
  }

  if (allowedRegionIds.length === 1) {
    return allowedRegionIds[0]!;
  }

  const allowedSet = new Set(allowedRegionIds);
  const candidates = VERTEX_REGIONS.filter(r => allowedSet.has(r.id));

  if (candidates.length === 0) {
    return allowedRegionIds[0]!;
  }

  let nearest = candidates[0]!;
  let minDist = haversineDistanceKm(lat, lng, nearest.lat, nearest.lng);

  for (let i = 1; i < candidates.length; i++) {
    const dist = haversineDistanceKm(lat, lng, candidates[i]!.lat, candidates[i]!.lng);
    if (dist < minDist) {
      minDist = dist;
      nearest = candidates[i]!;
    }
  }

  return nearest.id;
}

/**
 * Resolve the best Vertex AI region for a given provider + user location.
 *
 * For Gemini (Express Mode / API key auth): always returns "global"
 * For Claude: picks nearest from CLAUDE_AVAILABLE_REGIONS
 * For Mistral: picks nearest from MISTRAL_AVAILABLE_REGIONS
 * For open models: picks nearest from OPEN_MODEL_AVAILABLE_REGIONS
 */
export function resolveVertexRegionForProvider(
  provider: string,
  userLat?: number | null,
  userLng?: number | null,
): string {
  // Gemini Express Mode uses global endpoint (no project/location needed)
  if (provider === "google" || provider === "gemini") {
    return "global";
  }

  // Default fallback coords: Stockholm, Sweden (since user is based there)
  const lat = userLat ?? 59.33;
  const lng = userLng ?? 18.07;

  switch (provider) {
    case "anthropic":
    case "claude":
      return findNearestVertexRegion(lat, lng, CLAUDE_AVAILABLE_REGIONS);
    case "mistral":
      return findNearestVertexRegion(lat, lng, MISTRAL_AVAILABLE_REGIONS);
    case "deepseek":
    case "qwen":
    case "llama":
    case "open":
      return findNearestVertexRegion(lat, lng, OPEN_MODEL_AVAILABLE_REGIONS);
    default:
      return findNearestVertexRegion(lat, lng, CLAUDE_AVAILABLE_REGIONS);
  }
}

// ─── URL Builders ──────────────────────────────────────────────────────────────

/**
 * Build the Vertex AI regional endpoint base URL.
 *
 * Regional:  https://{location}-aiplatform.googleapis.com/v1/projects/{projectId}/locations/{location}/publishers/{publisher}
 * Global:    https://aiplatform.googleapis.com/v1/projects/{projectId}/locations/global/publishers/{publisher}
 * Express:   https://aiplatform.googleapis.com/v1/publishers/google (no project, API key auth)
 */
export function buildVertexBaseUrl(options: {
  location: string;
  projectId?: string;
  publisher?: string;
  expressMode?: boolean;
}): string {
  const { location, projectId, publisher = "google", expressMode } = options;

  // Express Mode: simplified URL, no project/location path segments
  if (expressMode) {
    return `https://aiplatform.googleapis.com/v1/publishers/${publisher}`;
  }

  // Global endpoint
  if (location === "global") {
    if (projectId) {
      return `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/global/publishers/${publisher}`;
    }
    return `https://aiplatform.googleapis.com/v1/publishers/${publisher}`;
  }

  // Regional endpoint
  if (projectId) {
    return `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/${publisher}`;
  }

  return `https://${location}-aiplatform.googleapis.com/v1/publishers/${publisher}`;
}

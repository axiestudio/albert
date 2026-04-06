import { type FC, useState } from "react";
import { ExternalLinkIcon, ScaleIcon, FileTextIcon, GavelIcon, BookOpenIcon, ScrollTextIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const RIKSDAGEN_DOC_BASE = "https://data.riksdagen.se/dokument";
const RIKSDAGEN_STATUS_BASE = "https://data.riksdagen.se/dokumentstatus";

// ─── Document type styling ────────────────────────────────────────────────
type DocType = "sfs" | "prop" | "bet" | "sou" | "ds" | "rskr" | "mot" | "unknown";

const DOC_TYPE_META: Record<DocType, { label: string; shortLabel: string; icon: FC<{ className?: string }>; badgeClass: string }> = {
  sfs: {
    label: "Svensk författningssamling",
    shortLabel: "SFS",
    icon: ScaleIcon,
    badgeClass: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300",
  },
  prop: {
    label: "Proposition",
    shortLabel: "Prop.",
    icon: FileTextIcon,
    badgeClass: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900 dark:bg-purple-950/50 dark:text-purple-300",
  },
  bet: {
    label: "Betänkande",
    shortLabel: "Bet.",
    icon: GavelIcon,
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300",
  },
  sou: {
    label: "Statens offentliga utredningar",
    shortLabel: "SOU",
    icon: BookOpenIcon,
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300",
  },
  ds: {
    label: "Departementsserien",
    shortLabel: "Ds",
    icon: ScrollTextIcon,
    badgeClass: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950/50 dark:text-teal-300",
  },
  rskr: {
    label: "Riksdagsskrivelse",
    shortLabel: "Rskr.",
    icon: ScrollTextIcon,
    badgeClass: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-300",
  },
  mot: {
    label: "Motion",
    shortLabel: "Mot.",
    icon: FileTextIcon,
    badgeClass: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300",
  },
  unknown: {
    label: "Document",
    shortLabel: "Doc",
    icon: FileTextIcon,
    badgeClass: "border-border bg-muted text-muted-foreground",
  },
};

/** Detect document type from dok_id or explicit type string */
function detectDocType(dokId?: string, typ?: string): DocType {
  const t = (typ ?? "").toLowerCase();
  if (t === "sfs" || t === "sfst") return "sfs";
  if (t === "prop") return "prop";
  if (t === "bet") return "bet";
  if (t === "sou") return "sou";
  if (t === "ds") return "ds";
  if (t === "rskr") return "rskr";
  if (t === "mot") return "mot";
  // Fallback: infer from dok_id prefix
  const id = (dokId ?? "").toLowerCase();
  if (id.startsWith("sfs-")) return "sfs";
  if (id.startsWith("prop-") || id.startsWith("gw")) return "prop";
  if (id.startsWith("bet-") || id.startsWith("h")) return "bet";
  if (id.startsWith("sou-")) return "sou";
  if (id.startsWith("ds-")) return "ds";
  return "unknown";
}

/** Construct the best Riksdagen URL for a document */
function buildRiksdagenUrl(dokId?: string): string | null {
  if (!dokId) return null;
  return `${RIKSDAGEN_STATUS_BASE}/${encodeURIComponent(dokId)}`;
}

/** Extract year from beteckning "2022:811" → "2022" */
function extractYear(beteckning?: string): string | null {
  if (!beteckning) return null;
  const match = beteckning.match(/^(\d{4}):/);
  return match ? match[1] : null;
}

// ─── SourceIcon ───────────────────────────────────────────────────────────
export const SourceIcon: FC<{ url: string; className?: string }> = ({
  url,
  className,
}) => {
  const [failed, setFailed] = useState(false);
  const domain = getDomain(url);
  const initial = domain.charAt(0).toUpperCase();

  if (failed) {
    return (
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded bg-muted text-[9px] font-medium text-muted-foreground",
          className,
        )}
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      src={getFaviconUrl(url)}
      alt=""
      className={cn("size-4 shrink-0 rounded", className)}
      onError={() => setFailed(true)}
    />
  );
};

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).origin;
    return `${domain}/favicon.ico`;
  } catch {
    return "";
  }
}

// ─── SourceTitle ──────────────────────────────────────────────────────────
export const SourceTitle: FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <span className={cn("max-w-[37.5rem] truncate", className)}>{children}</span>
);

// ─── Source (single root element) ─────────────────────────────────────────
export const Source: FC<{
  href: string;
  variant?: string;
  size?: string;
  className?: string;
  children?: React.ReactNode;
  target?: string;
  rel?: string;
}> = ({
  href,
  className,
  children,
  target = "_blank",
  rel = "noopener noreferrer",
}) => (
  <a
    href={href}
    target={target}
    rel={rel}
    className={cn(
      "inline-flex items-center rounded-full font-medium transition-colors",
      className,
    )}
  >
    {children}
  </a>
);

// ─── Sources (SourceMessagePartComponent) ─────────────────────────────────
type SourcesProps = {
  url?: string;
  title?: string;
  sourceType?: string;
  /** SFS-specific fields from tool results */
  dokId?: string;
  beteckning?: string;
  typ?: string;
  organ?: string;
  datum?: string;
  [key: string]: unknown;
};

const Sources: FC<SourcesProps> & {
  Root: typeof Source;
  Icon: typeof SourceIcon;
  Title: typeof SourceTitle;
} = ({ url, title, dokId, beteckning, typ, organ, datum }) => {
  const docType = detectDocType(dokId, typ);
  const meta = DOC_TYPE_META[docType];
  const TypeIcon = meta.icon;
  const year = extractYear(beteckning);
  const href = url ?? buildRiksdagenUrl(dokId) ?? "#";

  // Format the display label: "SFS 2022:811" or "Prop. 2022/23:100"
  const displayLabel = beteckning
    ? `${meta.shortLabel} ${beteckning}`
    : title ?? dokId ?? "Unknown";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all hover:shadow-sm",
        meta.badgeClass,
      )}
      title={title ?? meta.label}
    >
      <TypeIcon className="size-3.5 shrink-0" />
      <span className="truncate">{displayLabel}</span>
      {year && (
        <span className="shrink-0 rounded bg-black/5 px-1 py-px text-[10px] font-semibold tabular-nums dark:bg-white/10">
          {year}
        </span>
      )}
      {organ && (
        <span className="hidden shrink-0 text-[10px] opacity-60 sm:inline">
          {organ}
        </span>
      )}
      <ExternalLinkIcon className="size-3 shrink-0 opacity-40 transition-opacity group-hover:opacity-100" />
    </a>
  );
};

Sources.Root = Source;
Sources.Icon = SourceIcon;
Sources.Title = SourceTitle;

export { Sources };
export default Sources;

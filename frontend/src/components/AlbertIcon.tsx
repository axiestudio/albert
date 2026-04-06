import type { FC } from "react";
import { cn } from "@/lib/utils";

type AlbertIconProps = {
  className?: string;
  size?: number;
};

export const AlbertIcon: FC<AlbertIconProps> = ({ className, size = 24 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 120 120"
    fill="none"
    width={size}
    height={size}
    className={cn("shrink-0", className)}
    aria-hidden="true"
  >
    <circle cx="60" cy="60" r="56" fill="currentColor" opacity="0.08" />
    <circle cx="60" cy="60" r="56" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
    <g transform="translate(60,52)">
      {/* Pillar */}
      <rect x="-2.5" y="-28" width="5" height="44" rx="2.5" fill="currentColor" opacity="0.55" />
      {/* Beam */}
      <rect x="-32" y="-30" width="64" height="4" rx="2" fill="currentColor" opacity="0.7" />
      {/* Left chain + pan */}
      <line x1="-28" y1="-26" x2="-28" y2="-10" stroke="currentColor" strokeWidth="2" opacity="0.5" />
      <path d="M-38,-10 Q-28,-4 -18,-10" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.6" />
      {/* Right chain + pan */}
      <line x1="28" y1="-26" x2="28" y2="-10" stroke="currentColor" strokeWidth="2" opacity="0.5" />
      <path d="M18,-10 Q28,-4 38,-10" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.6" />
      {/* Base */}
      <rect x="-14" y="16" width="28" height="3.5" rx="1.75" fill="currentColor" opacity="0.55" />
    </g>
    <text
      x="60"
      y="100"
      textAnchor="middle"
      fontFamily="system-ui,-apple-system,sans-serif"
      fontSize="14"
      fontWeight="700"
      fill="currentColor"
      opacity="0.75"
      letterSpacing="4"
    >
      A
    </text>
  </svg>
);

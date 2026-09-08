"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

type GoOpsSymbolProps = {
  className?: string;
  size?: number;
};

/** Electric Blue → Momentum Green G/loop mark with arrow (= "Go"). */
export function GoOpsSymbol({ className, size = 28 }: GoOpsSymbolProps) {
  const gradientId = useId();

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="4"
          y1="24"
          x2="44"
          y2="24"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#006DFF" />
          <stop offset="1" stopColor="#00D68F" />
        </linearGradient>
      </defs>
      <path
        d="M19 8.5C11.1 8.5 5 14.6 5 22.5S11.1 36.5 19 36.5H25M19 22.5H29.5C35.02 22.5 39.5 18.02 39.5 12.5C39.5 9.1 38 6.1 35.5 4L43.5 8.25L39.75 14.75C38.55 16.85 36.35 18.25 33.85 18.65C37.05 20.05 39.35 23.15 39.75 26.75C40.25 31.35 36.55 35.25 31.95 35.75C28.75 36.1 25.85 34.75 24.05 32.55"
        stroke={`url(#${gradientId})`}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M43.5 8.25L47.75 5.75L45.75 12.25Z"
        fill={`url(#${gradientId})`}
      />
    </svg>
  );
}

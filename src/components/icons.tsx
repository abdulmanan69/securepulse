/**
 * Inline icon set.
 *
 * Hand-drawn rather than pulled from a package: the app needs eleven glyphs,
 * and a dependency for that is bundle weight plus a supply-chain surface for
 * no benefit. All are 16x16 on a 1.5px stroke so they sit on the same optical
 * line as the type.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconGauge = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 12a5.5 5.5 0 1 1 11 0" />
    <path d="M8 12V8.5" />
    <path d="M10.5 6.5 8 9" />
  </Icon>
);

export const IconSites = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="5.75" />
    <path d="M2.4 8h11.2M8 2.25c1.6 1.7 2.4 3.65 2.4 5.75s-.8 4.05-2.4 5.75c-1.6-1.7-2.4-3.65-2.4-5.75S6.4 3.95 8 2.25Z" />
  </Icon>
);

export const IconReport = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 2.5h6l3 3v8h-9z" />
    <path d="M9.25 2.6V5.6h3" />
    <path d="M5.75 8.75h4.5M5.75 11h3" />
  </Icon>
);

export const IconActivity = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1.75 8h2.5l1.75-4.5 2.5 9 1.75-4.5h3.75" />
  </Icon>
);

export const IconSettings = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="2" />
    <path d="M8 1.75v1.6M8 12.65v1.6M14.25 8h-1.6M3.35 8h-1.6M12.42 3.58l-1.13 1.13M4.71 11.29l-1.13 1.13M12.42 12.42l-1.13-1.13M4.71 4.71 3.58 3.58" />
  </Icon>
);

export const IconCard = (p: IconProps) => (
  <Icon {...p}>
    <rect x="1.75" y="3.5" width="12.5" height="9" rx="1.25" />
    <path d="M1.75 6.75h12.5M4.25 10h2.5" />
  </Icon>
);

export const IconShield = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 1.75 13 3.5v4c0 3-2.1 5.4-5 6.75C5.1 12.9 3 10.5 3 7.5v-4z" />
  </Icon>
);

export const IconClock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 4.5V8l2.25 1.5" />
  </Icon>
);

export const IconArrowDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 3v10M4 9l4 4 4-4" />
  </Icon>
);

export const IconArrowUp = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 13V3M4 7l4-4 4 4" />
  </Icon>
);

export const IconChevron = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3.5 10.5 8 6 12.5" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 3.25v9.5M3.25 8h9.5" />
  </Icon>
);

export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7.25" cy="7.25" r="4.5" />
    <path d="m10.75 10.75 2.5 2.5" />
  </Icon>
);

export const IconCopy = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.25" />
    <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
  </Icon>
);

export const IconExternal = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 2.75h4.25V7M13.25 2.75 7.5 8.5" />
    <path d="M12 9.75v2.5a1 1 0 0 1-1 1H3.75a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h2.5" />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8.5 6.25 11.75 13 5" />
  </Icon>
);

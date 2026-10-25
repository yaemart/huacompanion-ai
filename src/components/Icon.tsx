export function Icon({ name, size = 28 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    medical: (
      <>
        <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" />
      </>
    ),
    business: (
      <>
        <rect x="3" y="7" width="18" height="14" rx="2" />
        <path d="M8 7V3h8v4M3 12l9 4 9-4M12 13v5" />
      </>
    ),
    transport: (
      <>
        <path d="M5 9l2-5h10l2 5M4 17h16V9H4zM7 17v3M17 17v3M7 12h1m8 0h1" />
      </>
    ),
    stays: (
      <>
        <path d="M5 21V3h14v18M2 21h20M10 21v-5h4v5M8 7h2m4 0h2M8 11h2m4 0h2" />
      </>
    ),
    travel: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M16 8l-2 6-6 2 2-6z" />
      </>
    ),
    interpretation: (
      <>
        <path d="M3 4h15v11h-8l-5 4v-4H3zM18 8h3v12h-3l-3 2v-5M7 8h7M7 11h4" />
      </>
    ),
    arrival: (
      <>
        <path d="M12 22s8-7 8-13a8 8 0 0 0-16 0c0 6 8 13 8 13z" />
        <circle cx="12" cy="9" r="3" />
      </>
    ),
    arrow: (
      <>
        <path d="M4 12h16M14 6l6 6-6 6" />
      </>
    ),
    check: <path d="M5 12l4 4L19 6" />,
    leaf: (
      <>
        <path d="M20 3C9 2 1 9 5 17s17 2 15-14zM4 21L16 8" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 3" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.arrival}
    </svg>
  );
}

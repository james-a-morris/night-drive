export default function Brand() {
  return (
    <>
      <svg
        className="brand-emblem"
        width={29}
        height={36}
        viewBox="0 0 32 40"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M5 34V15a11 11 0 0 1 22 0v19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z"
          stroke="currentColor"
          strokeWidth="1.1"
        />
        <path d="M20 9a5 5 0 1 0 3 8 5 5 0 0 1-3-8Z" fill="currentColor" />
        <path
          d="M11 35c0-8 10-6 10-12M16 35c0-7 7-7 5-12"
          stroke="currentColor"
          strokeWidth=".8"
        />
        <circle cx="11" cy="21" r=".7" fill="currentColor" />
      </svg>
      <span className="brand-wordmark">Night Line</span>
    </>
  );
}

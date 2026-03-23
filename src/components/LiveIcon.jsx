export default function LiveIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 8l7 4-7 4V8z" />
      <path d="M5.5 7.5a6.5 6.5 0 0 0 0 9" />
      <path d="M18.5 7.5a6.5 6.5 0 0 1 0 9" />
    </svg>
  );
}

/**
 * Decorative art behind the whole app for themes that have it (CSS shows it only for the BLM theme): a raised
 * fist above "Black Lives Matter". Fixed, faint, and never interactive, so it can't get in the way of data.
 */
export function ThemeBackdrop() {
  return (
    <div className="theme-backdrop" aria-hidden>
      <svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg">
        {/* Filled silhouette; the dark strokes separate forearm, palm, fingers and thumb. */}
        <g fill="currentColor" stroke="#0a0a0a" strokeWidth="5" strokeLinejoin="round">
          <rect x="66" y="160" width="68" height="132" rx="12" />
          <rect x="44" y="70" width="112" height="108" rx="26" />
          <rect x="47" y="34" width="27" height="68" rx="13.5" />
          <rect x="74" y="26" width="27" height="74" rx="13.5" />
          <rect x="101" y="28" width="27" height="72" rx="13.5" />
          <rect x="128" y="38" width="26" height="64" rx="13" />
          <rect x="38" y="110" width="90" height="32" rx="16" transform="rotate(-10 83 126)" />
        </g>
      </svg>
      <p>
        Black
        <br />
        Lives
        <br />
        Matter
      </p>
    </div>
  );
}

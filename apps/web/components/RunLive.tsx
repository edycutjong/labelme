"use client";

/** The family's "Run it live now" button. The Example is a server component; this asks the Game (a client island) for a live draw. */
export function RunLive() {
  return (
    <button type="button" className="btn primary" onClick={() => window.dispatchEvent(new CustomEvent("labelme:draw"))}>
      Run it live now · 13 credits
    </button>
  );
}

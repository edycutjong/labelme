/** Number formatting shared by the tell, the CLI and the browser (no Node imports here). */
export const fmtUsd = (n: number): string => {
  const a = Math.abs(n);
  const s =
    a >= 1e9
      ? `${(a / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`
      : a >= 1e6
        ? `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`
        : a >= 1e3
          ? `${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`
          : a.toFixed(0);
  return `${n < 0 ? "−" : ""}$${s}`;
};
export const pct = (x: number | null): string => (x === null ? "—" : `${Math.round(x * 100)}%`);

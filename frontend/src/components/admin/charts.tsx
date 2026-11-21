"use client";

/**
 * Admin dashboard charts (hand-built SVG, no chart library).
 *
 * Follows the dataviz method:
 *  * one series per chart, so one validated hue (--viz-1) and no legend box (the title names it);
 *    different measures become small multiples, never a dual axis
 *  * bars <= 24px thick, 4px rounded data-end, square at the baseline, recessive hairline grid
 *  * selective direct labels (the peak and the latest day only); text in text tokens
 *  * every bar is hoverable AND keyboard-focusable, with a tooltip; every chart has a table view
 */
import { clsx } from "clsx";
import { useId, useState } from "react";

const H = 150; // svg height (viewBox units)
const W = 320;
const PAD = { top: 18, right: 6, bottom: 22, left: 30 };

function niceCeil(x: number): number {
  if (x <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(x));
  return ([1, 2, 2.5, 5, 10].find((s) => s * mag >= x) ?? 10) * mag;
}

const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-IN");

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Top-rounded bar path (4px radius at the data end, square at the baseline). */
function barPath(x: number, y: number, w: number, h: number, r = 4): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

export interface ColumnDatum {
  date: string; // YYYY-MM-DD
  value: number;
}

/** Daily column chart: one series, hover + focus tooltips, table view. */
export function ColumnChart({ title, data, unit }: { title: string; data: ColumnDatum[]; unit: string }) {
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();
  const max = niceCeil(Math.max(0, ...data.map((d) => d.value)));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const band = innerW / Math.max(1, data.length);
  const barW = Math.min(24, band * 0.62);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  const peak = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const labelled = new Set([peak, data.length - 1].filter((i) => data[i] && data[i].value > 0));
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <figure className="glass rounded-2xl p-5" aria-labelledby={titleId}>
      <figcaption className="flex items-baseline justify-between gap-3">
        <span id={titleId} className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted">{full.format(total)} in 14 days</span>
      </figcaption>

      <div className="relative mt-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="group" aria-label={`${title}, daily, last 14 days`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="rgb(var(--line))" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle"
                className="fill-muted text-[9px] tabular-nums">{compact.format(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = PAD.left + band * i + band / 2;
            const h = Math.max(0, PAD.top + innerH - y(d.value));
            const isActive = active === i;
            return (
              <g
                key={d.date}
                tabIndex={0}
                role="img"
                aria-label={`${shortDate(d.date)}: ${full.format(d.value)} ${unit}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive((a) => (a === i ? null : a))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((a) => (a === i ? null : a))}
                className="cursor-default outline-none"
              >
                {/* hit target: the whole band, taller than the mark */}
                <rect x={cx - band / 2} y={PAD.top} width={band} height={innerH} fill="transparent" />
                {h > 0 && (
                  <path d={barPath(cx - barW / 2, y(d.value), barW, h)} fill="var(--viz-1)"
                    opacity={active === null || isActive ? 1 : 0.45} className="transition-opacity" />
                )}
                {isActive && (
                  <rect x={cx - band / 2 + 1} y={PAD.top - 4} width={band - 2} height={innerH + 4} rx={4}
                    fill="none" stroke="rgb(var(--fg))" strokeOpacity={0.35} strokeWidth={1} />
                )}
                {labelled.has(i) && active === null && (
                  <text x={cx} y={y(d.value) - 5} textAnchor="middle" className="fill-fg text-[9px] font-semibold tabular-nums">
                    {compact.format(d.value)}
                  </text>
                )}
                {(i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)) && (
                  <text x={cx} y={H - 6} textAnchor="middle" className="fill-muted text-[9px]">{shortDate(d.date)}</text>
                )}
              </g>
            );
          })}
        </svg>

        {total === 0 && (
          <p className="pointer-events-none absolute inset-0 grid place-items-center pb-6 text-xs text-muted">
            None in the last 14 days
          </p>
        )}
        {active !== null && data[active] && (
          <div
            role="presentation"
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-xl"
            style={{
              left: `${((PAD.left + band * active + band / 2) / W) * 100}%`,
              top: `${(y(data[active].value) / H) * 100}%`,
            }}
          >
            <p className="font-semibold tabular-nums text-fg">{full.format(data[active].value)} {unit}</p>
            <p className="text-muted">{shortDate(data[active].date)}</p>
          </div>
        )}
      </div>

      <button type="button" onClick={() => setShowTable((s) => !s)} aria-expanded={showTable}
        className="mt-2 text-xs font-semibold text-muted underline-offset-2 hover:text-fg hover:underline">
        {showTable ? "Hide table" : "View as table"}
      </button>
      {showTable && (
        <table className="mt-2 w-full text-xs">
          <thead><tr className="text-left text-muted"><th className="py-1 font-medium">Date</th><th className="py-1 text-right font-medium">{unit}</th></tr></thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.date} className="border-t border-line/60">
                <td className="py-1">{shortDate(d.date)}</td>
                <td className="py-1 text-right tabular-nums">{full.format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}

/** Ranked horizontal bars (one series). Few rows, so each value sits at its bar tip. */
export function BarList({ title, items, emptyText }: { title: string; items: { label: string; count: number }[]; emptyText: string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const titleId = useId();
  return (
    <figure className="glass rounded-2xl p-5" aria-labelledby={titleId}>
      <figcaption id={titleId} className="text-sm font-semibold">{title}</figcaption>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{emptyText}</p>
      ) : (
        <table className="mt-4 w-full border-separate border-spacing-y-2 text-sm">
          <caption className="sr-only">{title}</caption>
          <tbody>
            {items.map((item) => (
              <tr key={item.label} title={`${item.label}: ${full.format(item.count)}`} className="group">
                <th scope="row" className="w-28 truncate pr-3 text-left font-normal text-muted">{item.label}</th>
                <td>
                  <div className="flex items-center gap-2">
                    {/* Scale within the space left after the value label, so the label always sits at the tip. */}
                    <div className={clsx("h-2.5 rounded-r-[4px] transition-opacity group-hover:opacity-80")}
                      style={{
                        width: `calc((100% - 3.5rem) * ${item.count / max})`,
                        minWidth: item.count ? 4 : 0,
                        background: "var(--viz-1)",
                      }} />
                    <span className="shrink-0 tabular-nums text-fg">{full.format(item.count)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}

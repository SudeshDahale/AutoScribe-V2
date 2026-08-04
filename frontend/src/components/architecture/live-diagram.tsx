import { useMemo, useState } from "react";
import {
  graphEdges as defaultEdges,
  graphLayers,
  graphNodes as defaultNodes,
  typeAccent,
  type GraphEdge,
  type GraphNode,
} from "@/lib/architecture-graph";

type Props = {
  selectedId?: string | null;
  onSelect?: (node: GraphNode) => void;
  /** compact hides layer rails, edge labels and legend — for embedding in cards. */
  compact?: boolean;
  className?: string;
  /** Pause the flowing traffic animation. */
  paused?: boolean;
  /** Optional per-diagram node set. Falls back to the default global graph. */
  nodes?: GraphNode[];
  /** Optional per-diagram edge set. */
  edges?: GraphEdge[];
};


const W = 1000;
const H = 560;

function nodeBox(compact: boolean) {
  return compact ? { w: 132, h: 44 } : { w: 168, h: 62 };
}

function edgePath(from: GraphNode, to: GraphNode, compact: boolean) {
  const { w } = nodeBox(compact);
  const x1 = from.x + w / 2;
  const y1 = from.y;
  const x2 = to.x - w / 2;
  const y2 = to.y;
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

/**
 * Live architecture diagram — animated data flow between services.
 * Used on the Architecture page and embedded (compact) in repository views
 * so both surfaces read identically.
 */
export function LiveDiagram({
  selectedId,
  onSelect,
  compact = false,
  className = "",
  paused = false,
  nodes: nodesProp,
  edges: edgesProp,
}: Props) {
  const nodes = nodesProp ?? defaultNodes;
  const edges = edgesProp ?? defaultEdges;
  const nodeById = (id: string) => nodes.find((n) => n.id === id) ?? nodes[0];
  const [hovered, setHovered] = useState<string | null>(null);
  const { w, h } = nodeBox(compact);

  const focus = hovered ?? selectedId ?? null;

  const connected = useMemo(() => {
    if (!focus) return null;
    const set = new Set<string>([focus]);
    edges.forEach((e: GraphEdge) => {
      if (e.from === focus) set.add(e.to);
      if (e.to === focus) set.add(e.from);
    });
    return set;
  }, [focus]);

  return (
    <div className={`relative w-full ${className}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full block select-none"
        role="img"
        aria-label="Live architecture diagram"
      >
        <defs>
          <radialGradient id="ad-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ad-edge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity="0.05" />
            <stop offset="50%" stopColor="var(--chart-2)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity="0.12" />
          </linearGradient>
          <pattern id="ad-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth="1" />
          </pattern>
          <filter id="ad-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        <rect width={W} height={H} fill="url(#ad-grid)" />

        {/* Layer rails */}
        {!compact &&
          graphLayers.map((l) => (
            <g key={l.id}>
              <line
                x1={l.x}
                x2={l.x}
                y1={28}
                y2={H - 12}
                stroke="rgba(255,255,255,0.05)"
                strokeDasharray="3 6"
              />
              <text
                x={l.x}
                y={20}
                textAnchor="middle"
                fontSize="11"
                letterSpacing="1.2"
                fill="var(--muted-foreground)"
              >
                {l.title.toUpperCase()}
              </text>
            </g>
          ))}

        {/* Edges + travelling packets */}
        {edges.map((e: GraphEdge) => {
          const a = nodeById(e.from);
          const b = nodeById(e.to);
          const d = edgePath(a, b, compact);
          const dim = connected ? !(connected.has(e.from) && connected.has(e.to)) : false;
          const dur = 5.2 - e.traffic * 3;
          const packets = e.traffic > 0.7 ? 3 : e.traffic > 0.45 ? 2 : 1;
          const accent = e.kind === "async" ? "var(--chart-3)" : typeAccent[b.type];
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;

          return (
            <g key={`${e.from}-${e.to}`} opacity={dim ? 0.15 : 1} className="transition-opacity">
              <path
                d={d}
                fill="none"
                stroke="url(#ad-edge)"
                strokeWidth={compact ? 1.2 : 1.6}
                strokeDasharray={e.kind === "async" ? "5 6" : undefined}
              />
              {!paused &&
                Array.from({ length: packets }).map((_, i) => (
                  <circle key={i} r={compact ? 2 : 2.8} fill={accent}>
                    <animateMotion
                      dur={`${dur}s`}
                      repeatCount="indefinite"
                      begin={`${(dur / packets) * i}s`}
                      path={d}
                      keyPoints="0;1"
                      keyTimes="0;1"
                      calcMode="linear"
                    />
                    <animate
                      attributeName="opacity"
                      values="0;1;1;0"
                      keyTimes="0;0.12;0.85;1"
                      dur={`${dur}s`}
                      begin={`${(dur / packets) * i}s`}
                      repeatCount="indefinite"
                    />
                  </circle>
                ))}
              {!compact && focus && connected?.has(e.from) && connected?.has(e.to) && (
                <text
                  x={mx}
                  y={my - 8}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--muted-foreground)"
                >
                  {e.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((n: GraphNode) => {
          const Icon = n.icon;
          const active = selectedId === n.id;
          const dim = connected ? !connected.has(n.id) : false;
          const accent = typeAccent[n.type];
          const x = n.x - w / 2;
          const y = n.y - h / 2;

          return (
            <g
              key={n.id}
              transform={`translate(${x} ${y})`}
              opacity={dim ? 0.25 : 1}
              className="cursor-pointer transition-opacity"
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered((v) => (v === n.id ? null : v))}
              onClick={() => onSelect?.(n)}
            >
              {(active || hovered === n.id) && (
                <ellipse
                  cx={w / 2}
                  cy={h / 2}
                  rx={w * 0.72}
                  ry={h * 0.95}
                  fill="url(#ad-glow)"
                  filter="url(#ad-blur)"
                />
              )}
              <rect
                width={w}
                height={h}
                rx={12}
                fill="var(--surface-2)"
                stroke={active ? accent : "var(--border)"}
                strokeWidth={active ? 1.6 : 1}
              />
              {/* accent spine */}
              <rect x={0} y={0} width={3} height={h} rx={2} fill={accent} opacity={0.9} />

              <g transform={`translate(${compact ? 12 : 16} ${h / 2 - 9})`}>
                <foreignObject width="18" height="18">
                  <Icon className="w-[18px] h-[18px] text-foreground/80" strokeWidth={1.75} />
                </foreignObject>
              </g>

              <text
                x={compact ? 38 : 44}
                y={compact ? h / 2 + 1 : h / 2 - 3}
                fontSize={compact ? 11.5 : 13}
                fill="var(--foreground)"
                fontWeight="500"
              >
                {compact ? n.short : n.label}
              </text>
              {!compact && (
                <text x={44} y={h / 2 + 14} fontSize="10.5" fill="var(--muted-foreground)">
                  {n.tech[0]} · {n.files} files
                </text>
              )}

              {/* live health pip */}
              <circle
                cx={w - 12}
                cy={12}
                r={3}
                fill={
                  n.health === "healthy"
                    ? "var(--success)"
                    : n.health === "attention"
                      ? "var(--warning)"
                      : "var(--chart-5)"
                }
              >
                {n.health !== "healthy" && !paused && (
                  <animate
                    attributeName="opacity"
                    values="1;0.25;1"
                    dur="1.6s"
                    repeatCount="indefinite"
                  />
                )}
              </circle>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function DiagramLegend({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] ${className}`}>
      {(
        [
          ["client", "Client"],
          ["gateway", "Edge"],
          ["service", "Service"],
          ["data", "Data store"],
        ] as const
      ).map(([k, label]) => (
        <span key={k} className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span
            className="w-2 h-2 rounded-[3px]"
            style={{ backgroundColor: typeAccent[k] }}
          />
          {label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <span className="w-4 h-px bg-foreground/30" /> sync call
      </span>
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <span className="w-4 border-t border-dashed border-foreground/30" /> async event
      </span>
    </div>
  );
}

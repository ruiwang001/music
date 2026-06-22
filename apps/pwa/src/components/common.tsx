import type { ReactNode } from "react";
import type { MusicTask } from "../api";
import { statusLabel } from "../lib/format";

export function AuroraFrame({ children }: { children: ReactNode }) {
  return (
    <div className="aurora-frame">
      <div className="aurora-layer layer-one" />
      <div className="aurora-layer layer-two" />
      <div className="grain-layer" />
      {children}
    </div>
  );
}

export function ControlGroup({ label, children, compact = false }: { label: string; children: ReactNode; compact?: boolean }) {
  return (
    <div className={`control-group ${compact ? "compact-control" : ""}`}>
      <strong>{label}</strong>
      <div>{children}</div>
    </div>
  );
}

export function CoverArt({ title, coverUrl }: { title: string; coverUrl?: string | null }) {
  return (
    <div className="cover-art">
      {coverUrl ? <img src={coverUrl} alt={`${title} cover`} /> : <div className="cover-fallback"><span>{title.slice(0, 1).toUpperCase()}</span></div>}
    </div>
  );
}

export function StatusPill({ status }: { status: MusicTask["status"] }) {
  return <span className={`status-pill ${status}`}>{statusLabel(status)}</span>;
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card glass-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

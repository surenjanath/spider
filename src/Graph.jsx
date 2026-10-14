import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Minus,
  Plus,
  Maximize,
  Crosshair,
  Orbit,
  Expand,
  Layers,
  Play,
  Pause,
  X,
} from "lucide-react";
import { makeWeb, LEG_COUNT, FEELER_COUNT } from "./spider-motion";
import { startSpiderRenderer } from "./spider-renderer";

export function SpiderMark({ size = 24, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M17 16 10 10 10 4M19 16 26 10 26 4M15 18 7 15 3 10M21 18 29 15 33 10M15 21 7 23 3 29M21 21 29 23 33 29M17 23 11 29 12 34M19 23 25 29 24 34"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m18 10 5 8-5 10-5-10 5-8Z" fill="currentColor" />
      <circle cx="18" cy="8" r="2" fill="currentColor" />
    </svg>
  );
}

export default function Graph({
  activeSection,
  sections,
  running,
  cursor,
  total,
  onSelectSection,
  onInspect,
  findings,
  speed,
  onAdvance,
  onReadRate,
  onToggleRun,
  onSeek,
  onChangeSpeed,
  onEnterSection,
}) {
  const canvasRef = useRef(null);
  const volumeBack = useRef(null),
    volumeFront = useRef(null);
  const depthElement = useRef(null),
    depthValue = useRef(null),
    depthBar = useRef(null);
  const tokenElements = useRef(new Map());
  const sectionElements = useRef(new Map());
  const bodyElement = useRef(null);
  const phaseElement = useRef(null);
  const expandButton = useRef(null);
  const theaterRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [labels, setLabels] = useState(true);
  const [followCamera, setFollowCamera] = useState(true);
  const [viewRevision, setViewRevision] = useState(0);
  const sectionCount = sections.length;
  const web = useMemo(() => makeWeb(sectionCount), [sectionCount]);
  const [expanded, setExpanded] = useState(false);
  const [telemetry, setTelemetry] = useState({ fps: 0, frame: 0 });
  const model = useMemo(
    () => ({
      sections,
      findings,
      tokens: sections.flatMap((s) => s.tokens),
      web,
      byEnd: new Map(findings.map((f) => [f.tokenIndex, f])),
      byId: new Map(findings.map((f) => [f.id, f])),
    }),
    [sections, findings, web],
  );
  const section = sections[activeSection] || sections[0];
  const visibleTokens = useMemo(() => {
    if (!section) return [];
    const start = section.tokens[0]?.index || 0;
    const last = section.tokens.at(-1)?.index || start;
    const position = Math.max(start, Math.min(cursor, last));
    return section.tokens.filter(
      (t) => t.index >= position - 4 && t.index <= position + 2,
    );
  }, [section, cursor]);
  const currentToken = model.tokens[Math.min(cursor, total - 1)];
  const lastFinding = [...findings]
    .reverse()
    .find((f) => f.tokenIndex < cursor);
  const current = {
    model,
    cursor,
    running,
    activeSection,
    zoom,
    labels,
    speed,
    visibleTokens,
    followCamera,
    viewRevision,
    onAdvance,
    onReadRate,
  };
  const latest = useRef(current);
  latest.current = current;
  useEffect(
    () =>
      startSpiderRenderer(
        canvasRef.current,
        latest,
        {
          tokens: tokenElements,
          sections: sectionElements,
          body: bodyElement,
          phase: phaseElement,
          back: volumeBack,
          front: volumeFront,
          depth: depthElement,
          depthValue,
          depthBar,
        },
        (value) => {
          setTelemetry(value);
          latest.current.onReadRate?.(value.wordsPerSecond);
        },
      ),
    [],
  );
  useEffect(() => {
    if (!expanded) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    theaterRef.current
      ?.querySelector('[aria-label="Close live view"]')
      ?.focus();
    const keydown = (e) => {
      if (document.querySelector(".modal-overlay")) return;
      if (e.key === "Escape") {
        setExpanded(false);
        return;
      }
      if (e.key === "Tab") {
        const controls = theaterRef.current.querySelectorAll(
          "button:not(:disabled),input",
        );
        const first = controls[0],
          last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [expanded]);
  const inspectWord = (token) => {
    const finding =
      token.index < cursor ? model.byId.get(token.findingId) : null;
    onInspect(
      finding || {
        id: `token-${token.index}`,
        phrase: token.text,
        section: sections[token.section]?.name,
        type: token.index < cursor ? token.type : "unclassified",
        status: token.index < cursor ? "read" : "unread",
        confidence: null,
        reason:
          token.index < cursor
            ? "Read as a statement or connective word. No exact source alias or ambiguity rule matched."
            : "This word is queued. Its classification is revealed when the reading probe completes its cycle.",
      },
    );
  };
  return (
    <section
      ref={theaterRef}
      className={`graph-panel spider-live galaxy-live ${expanded ? "graph-expanded" : ""}`}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded ? true : undefined}
      aria-label={expanded ? "Expanded live crawl" : undefined}
    >
      <div className="graph-top">
        <div>
          <span className="eyebrow">NEURAL GALAXY</span>
          <div className="graph-sub">
            <span className={`live-dot ${running ? "pulsing" : ""}`} />
            {running
              ? followCamera
                ? "Following the spider · live crawl"
                : "Galaxy atlas · live crawl"
              : cursor >= total
                ? "All words explored"
                : "Crawl paused — press play"}
          </div>
        </div>
        <div className="spider-top-actions">
          <span className="graph-fps">
            {running ? `${telemetry.fps || "…"} FPS` : "PAUSED"} <span>·</span>{" "}
            LOCAL
          </span>
          <button
            className="dive-cluster"
            aria-label={`Enter ${section?.name || "active"} cluster`}
            title="Start a journey into this cluster"
            onClick={() => onEnterSection?.(activeSection)}
          >
            <Orbit size={14} />
            <span>Dive in</span>
          </button>
          <button
            ref={expandButton}
            aria-label={expanded ? "Close live view" : "Expand live view"}
            title={expanded ? "Close live view (Esc)" : "Expand live view"}
            className="expand-live"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <X size={15} /> : <Expand size={14} />}
          </button>
        </div>
      </div>
      <div className="spider-telemetry">
        <span>
          LEGS <b>{LEG_COUNT}</b>
        </span>
        <span>
          PROBES <b>{FEELER_COUNT + 2}</b>
        </span>
        <span>
          WORDS{" "}
          <b>
            {cursor}
            <em>/{total}</em>
          </b>
        </span>
        <span className="spider-frame">
          FRAME <b>{String(telemetry.frame).padStart(5, "0")}</b>
        </span>
      </div>
      <div className="graph-stage">
        <canvas
          ref={volumeBack}
          className="volume-layer volume-back"
          aria-hidden="true"
        />
        <canvas
          ref={volumeFront}
          className="volume-layer volume-front"
          aria-hidden="true"
        />
        <canvas
          ref={canvasRef}
          className="spider-canvas"
          data-spider-canvas="true"
          tabIndex={0}
          aria-label="Layered neural galaxy with a living spider walking between star clusters, planting feet on web fibers and reaching for prompt words"
        />
        {labels && (
          <div className="live-word-layer">
            {sections.map((s) => (
              <button
                key={s.index}
                ref={(node) => {
                  if (node) sectionElements.current.set(s.index, node);
                  else sectionElements.current.delete(s.index);
                }}
                className={`web-section-label ${s.index === activeSection ? "active" : ""}`}
                style={{ "--section-color": s.color }}
                onClick={() => onSelectSection(s.index)}
                onDoubleClick={() => onEnterSection?.(s.index)}
                title="Click to inspect · Double-click to enter this cluster"
              >
                <b>{s.name.toLowerCase()}</b>
                <small>
                  {s.tokens.filter((t) => t.index < cursor).length}/
                  {s.tokens.length} words ·{" "}
                  {s.tokens.every((t) => t.index < cursor)
                    ? "mapped"
                    : s.index === activeSection
                      ? "exploring"
                      : "queued"}
                </small>
              </button>
            ))}
            {visibleTokens.map((token) => (
              <button
                key={token.index}
                ref={(node) => {
                  if (node) tokenElements.current.set(token.index, node);
                  else tokenElements.current.delete(token.index);
                }}
                className={`graph-token ${token.index === cursor ? "current" : ""} ${token.index < cursor ? token.status : "queued"}`}
                data-word-index={token.index}
                aria-label={`${token.text}: ${token.index === cursor ? "currently reading" : token.index < cursor ? token.type : "queued"}`}
                onClick={() => inspectWord(token)}
              >
                <i />
                <span>{token.text}</span>
                <small>
                  {token.index === cursor
                    ? "READING"
                    : token.index < cursor
                      ? token.status === "flagged"
                        ? "ASK"
                        : token.type.toUpperCase()
                      : "QUEUED"}
                </small>
              </button>
            ))}
          </div>
        )}
        <div className="spider-body-label" ref={bodyElement}>
          <span>{section?.name.toLowerCase()}</span>
          <small ref={phaseElement}>{running ? "REACHING" : "PAUSED"}</small>
        </div>
      </div>
      <div className="galaxy-depth-label">
        <i />
        <span ref={depthElement}>OUTER SHELL</span>
        <div className="depth-track">
          <b ref={depthBar} />
        </div>
        <strong ref={depthValue}>0%</strong>
        <small>DRAG TO ORBIT</small>
      </div>
      <div className="word-readout">
        <span className={`readout-light ${running ? "on" : ""}`} />
        <span className="readout-status">
          {cursor >= total ? "COMPLETE" : running ? "READING" : "NEXT WORD"}
        </span>
        <b>
          {cursor >= total ? "Context connected." : currentToken?.text || "—"}
        </b>
        <span className="readout-position">
          {Math.min(cursor + 1, total)} / {total}
        </span>
      </div>
      <div className="graph-bottom">
        <div className="graph-legend">
          <span>
            <i className="legend-dot resolved" />
            Linked
          </span>
          <span>
            <i className="legend-dot flagged" />
            Ask
          </span>
          <span>
            <i className="legend-dot pending" />
            Queued
          </span>
        </div>
        <div className="graph-tools">
          <button
            aria-label="Follow spider"
            title={
              followCamera
                ? "Journey camera — click for atlas view"
                : "Atlas view — click to travel into the cluster"
            }
            aria-pressed={followCamera}
            className={`follow-camera ${followCamera ? "selected" : ""}`}
            onClick={() => setFollowCamera((value) => !value)}
          >
            <Crosshair size={14} />
          </button>
          <button
            aria-label="Zoom out"
            title="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.7, z - 0.15))}
          >
            <Minus size={14} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            aria-label="Zoom in"
            title="Zoom in"
            onClick={() => setZoom((z) => Math.min(1.75, z + 0.15))}
          >
            <Plus size={14} />
          </button>
          <button
            aria-label="Reset graph view"
            title="Reset graph view"
            onClick={() => {
              setZoom(1);
              setFollowCamera(true);
              setViewRevision((v) => v + 1);
            }}
          >
            <Maximize size={13} />
          </button>
          <button
            aria-label="Toggle graph labels"
            title="Toggle word labels"
            aria-pressed={labels}
            onClick={() => setLabels(!labels)}
            className={labels ? "selected" : ""}
          >
            <Layers size={13} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="live-view-console">
          <div className="live-view-evidence">
            <span>LAST FINDING</span>
            <b>{lastFinding?.phrase || "Waiting for the first word"}</b>
            <small>
              {lastFinding?.source?.title ||
                lastFinding?.question ||
                "Exact sources. No guessing."}
            </small>
          </div>
          <div className="live-view-playback">
            <button
              className="live-view-play"
              onClick={onToggleRun}
              aria-label={running ? "Pause live crawl" : "Play live crawl"}
            >
              {running ? <Pause size={16} /> : <Play size={16} />}
              <span>
                {running ? "Pause" : cursor >= total ? "Replay" : "Play"}
              </span>
            </button>
            <input
              type="range"
              aria-label="Live view timeline"
              min="0"
              max={total}
              value={cursor}
              onChange={(e) => onSeek(Number(e.target.value))}
            />
            <span>
              {cursor}/{total}
            </span>
            <button
              className="live-speed"
              onClick={onChangeSpeed}
              aria-label="Change live view speed"
            >
              {speed}×
            </button>
          </div>
          <div className="live-view-footnote">
            8 articulated legs · 12 sensory feelers · 2 reading probes{" "}
            <span>ask, don’t guess.</span>
          </div>
        </div>
      )}
    </section>
  );
}

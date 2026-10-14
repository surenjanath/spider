import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  Braces,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Code2,
  Database,
  FileText,
  Flag,
  History,
  Info,
  Link2,
  Network,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Terminal,
  Upload,
  X,
} from "lucide-react";
import Graph, { SpiderMark } from "./Graph";
import {
  analyzePrompt,
  DEMO_PROMPT,
  getMetrics,
  INITIAL_SOURCES,
} from "./engine";
import "./styles.css";

function loadStored(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
const TYPES = {
  claim: "#9ac7d2",
  owner: "#d3bd7c",
  file: "#a1b5d2",
  approval: "#94b889",
  vague: "#dfaa7e",
};
function saveStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function IconButton({ label, children, onClick, className = "" }) {
  return (
    <button
      className={`icon-button ${className}`}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Modal({ title, subtitle, children, onClose, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    const handler = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll(
          'button:not(:disabled), input, textarea, select, [tabindex="0"]',
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "wide" : ""}`}
      >
        <header>
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <IconButton label="Close dialog" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        {children}
      </section>
    </div>
  );
}
function Radar({ analysis, cursor }) {
  const dims = analysis.sections.slice(0, 8);
  const n = Math.max(dims.length, 3);
  const point = (i, r) => [
    87 + Math.sin((i * 2 * Math.PI) / n) * r,
    73 - Math.cos((i * 2 * Math.PI) / n) * r,
  ];
  const path = (radius) =>
    Array.from({ length: n }, (_, i) => point(i, radius).join(",")).join(" ");
  return (
    <svg
      className="radar"
      viewBox="0 0 174 148"
      role="img"
      aria-label="Coverage by prompt section"
    >
      <g fill="none" stroke="#303238" strokeWidth=".6">
        {[15, 30, 45].map((r) => (
          <polygon key={r} points={path(r)} />
        ))}
        {Array.from({ length: n }, (_, i) => (
          <line
            key={i}
            x1="87"
            y1="73"
            x2={point(i, 45)[0]}
            y2={point(i, 45)[1]}
          />
        ))}
      </g>
      <polygon
        points={Array.from({ length: n }, (_, i) => {
          const tokens = dims[i]?.tokens || [];
          const progress = tokens.length
            ? tokens.filter((t) => t.index < cursor).length / tokens.length
            : 0;
          return point(i, 10 + 35 * progress).join(",");
        }).join(" ")}
        fill="rgba(225,163,196,.11)"
        stroke="#b589a4"
        strokeWidth="1.1"
      />
      {dims.map((d, i) => (
        <text
          key={i}
          x={point(i, 60)[0]}
          y={point(i, 60)[1] + 3}
          textAnchor="middle"
          fill="#888a92"
          fontSize="7.5"
          fontFamily="monospace"
        >
          {d.name.toUpperCase().slice(0, 4)}
        </text>
      ))}
    </svg>
  );
}
function ScoreGauge({ score }) {
  return (
    <div className="score-gauge">
      <svg viewBox="0 0 180 125">
        <path
          d="M 29 105 A 72 72 0 1 1 151 105"
          pathLength="100"
          fill="none"
          stroke="#26252a"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          className="score-arc"
          d="M 29 105 A 72 72 0 1 1 151 105"
          pathLength="100"
          fill="none"
          stroke="#dfb0ca"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${score} 100`}
        />
        {Array.from({ length: 31 }, (_, i) => {
          const a = ((140 + i * 8.65) * Math.PI) / 180;
          return (
            <line
              key={i}
              x1={90 + Math.cos(a) * 61}
              y1={64 + Math.sin(a) * 61}
              x2={90 + Math.cos(a) * 58}
              y2={64 + Math.sin(a) * 58}
              stroke="#4c444d"
              strokeWidth=".8"
            />
          );
        })}
      </svg>
      <div className="score-number">
        {score}
        <span>/ 100</span>
      </div>
      <span className="gauge-zero">0</span>
      <span className="gauge-hundred">100</span>
    </div>
  );
}

function ScoreHistory({ analysis, cursor, score }) {
  const samples = Array.from(
    { length: 20 },
    (_, i) => getMetrics(analysis, Math.round((cursor * i) / 19)).score,
  );
  const points = samples.map(
    (value, i) =>
      `${((i * 170) / 19).toFixed(2)} ${(23 - ((value - 37) * 22) / 63).toFixed(2)}`,
  );
  const line = "M" + points.join(" L");
  return (
    <div className="score-sparkline">
      <span>37</span>
      <svg
        viewBox="0 0 170 24"
        preserveAspectRatio="none"
        aria-label="Specificity score progression"
      >
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d9adc5" stopOpacity=".2" />
            <stop offset="100%" stopColor="#d9adc5" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} V24 H0Z`} fill="url(#sparkFill)" />
        <path d={line} stroke="#b98da7" strokeWidth="1" fill="none" />
      </svg>
      <span>{score}</span>
    </div>
  );
}

function App() {
  const [prompt, setPrompt] = useState(() =>
    loadStored("spider-prompt", DEMO_PROMPT),
  );
  const [sources, setSources] = useState(() =>
    loadStored("spider-sources", INITIAL_SOURCES),
  );
  const [answers, setAnswers] = useState(() =>
    loadStored("spider-answers", {}),
  );
  const analysis = useMemo(
    () => analyzePrompt(prompt, sources, answers),
    [prompt, sources, answers],
  );
  const [cursor, setCursor] = useState(0);
  const [running, setRunning] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [speed, setSpeed] = useState(1);
  const [readRate, setReadRate] = useState(0);
  const [selectedSection, setSelectedSection] = useState(null);
  const metrics = useMemo(
    () => getMetrics(analysis, cursor),
    [analysis, cursor],
  );
  const activeSection =
    selectedSection ??
    analysis.tokens[Math.min(cursor, analysis.tokens.length - 1)]?.section ??
    0;
  const [modal, setModal] = useState(null);
  const [inspect, setInspect] = useState(null);
  const [tab, setTab] = useState("flags");
  const [toast, setToast] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [answerDraft, setAnswerDraft] = useState("");
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceForm, setSourceForm] = useState(false);
  const [draft, setDraft] = useState(prompt);
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  const [sourceAliases, setSourceAliases] = useState("");
  const [history, setHistory] = useState(() =>
    loadStored("spider-history", []),
  );
  const fileRef = useRef(null);
  const promptRef = useRef(null);
  const savedRun = useRef(false);
  useEffect(() => {
    if (!saveStored("spider-prompt", prompt))
      setToast(
        "Browser storage is unavailable or full. Export your context to keep a copy.",
      );
  }, [prompt]);
  useEffect(() => {
    if (!saveStored("spider-sources", sources))
      setToast(
        "Browser storage is unavailable or full. Export your context to keep a copy.",
      );
  }, [sources]);
  useEffect(() => {
    if (!saveStored("spider-answers", answers))
      setToast(
        "Browser storage is unavailable or full. Export your context to keep a copy.",
      );
  }, [answers]);
  useEffect(() => {
    if (cursor >= analysis.tokens.length && running) {
      setRunning(false);
      notify("Crawl complete. Your context is ready to export.");
      if (!savedRun.current) {
        savedRun.current = true;
        setHistory((h) => {
          const next = [
            {
              date: new Date().toISOString(),
              words: metrics.total,
              links: metrics.links.length,
              flags: metrics.flags.length,
              score: metrics.score,
            },
            ...h,
          ].slice(0, 20);
          saveStored("spider-history", next);
          return next;
        });
      }
    }
  }, [cursor, running]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (inspect) setAnswerDraft(inspect.answer || "");
  }, [inspect]);
  useEffect(() => {
    if (exportOpen) {
      const listener = () => setExportOpen(false);
      window.addEventListener("click", listener);
      return () => window.removeEventListener("click", listener);
    }
  }, [exportOpen]);
  const notify = (message) => setToast(message);
  const selectSection = (index) => {
    setSelectedSection(index);
    setRunning(false);
    document
      .getElementById(`section-${index}`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  const restart = () => {
    setCursor(0);
    setSelectedSection(null);
    setRunning(false);
    savedRun.current = false;
    notify("Crawl reset. Your prompt and knowledge are unchanged.");
  };
  const run = () => {
    if (cursor >= analysis.tokens.length) {
      setCursor(0);
      savedRun.current = false;
    }
    setSelectedSection(null);
    setRunning(!running);
  };
  function exportData(format) {
    const payload = {
      version: "1.0",
      createdAt: new Date().toISOString(),
      prompt,
      complete: cursor >= analysis.tokens.length,
      score: metrics.score,
      scoring:
        "37 baseline + 18 × read coverage + 45 × resolved findings / total findings",
      wordsRead: metrics.words,
      wordsGuessed: 0,
      links: metrics.links,
      flags: metrics.flags,
      sources,
    };
    let content = JSON.stringify(payload, null, 2);
    if (format === "md")
      content = `# Prompt Spider · Context package\n\nSpec score: ${metrics.score}/100\nWords read: ${cursor}/${metrics.total}\nWords guessed: 0\nStatus: ${payload.complete ? "Complete" : "Partial crawl"}\n\n## Original prompt\n\n${prompt}\n\n## Resolved context\n\n${metrics.links.map((f) => `- **${f.phrase}**: ${f.answer || f.source?.content}\n  Source: ${f.source?.path || "User clarification"}`).join("\n")}\n\n## Questions to resolve\n\n${metrics.flags.map((f) => `- **${f.phrase}**: ${f.question}`).join("\n")}`;
    const blob = new Blob([content], {
      type: format === "json" ? "application/json" : "text/markdown",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `studio.prompt-context.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setExportOpen(false);
    notify("Context package exported. Original prompt preserved.");
  }
  function addSource(e) {
    e.preventDefault();
    if (!sourceTitle.trim() || !sourceContent.trim() || !sourceAliases.trim())
      return;
    setSources((s) => [
      ...s,
      {
        id: crypto.randomUUID(),
        title: sourceTitle.trim(),
        content: sourceContent.trim(),
        aliases: sourceAliases
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        kind: "File",
        path: `Personal / ${sourceTitle.trim()}`,
        updated: "Just now",
      },
    ]);
    setSourceTitle("");
    setSourceContent("");
    setSourceAliases("");
    setSourceForm(false);
    notify("Source indexed. Matching prompt phrases are now linked.");
  }
  async function importFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      notify("Please choose a text file smaller than 1 MB.");
      return;
    }
    setSourceTitle(file.name.replace(/\.[^.]+$/, ""));
    setSourceContent(await file.text());
    setSourceForm(true);
    event.target.value = "";
  }
  useEffect(() => {
    if (!running || !promptRef.current) return;
    const container = promptRef.current;
    const word = container.querySelector(".word.reading");
    if (!word) return;
    const bounds = container.getBoundingClientRect();
    const wordBounds = word.getBoundingClientRect();
    if (wordBounds.bottom > bounds.bottom - 24) {
      container.scrollTop += wordBounds.bottom - bounds.bottom + 48;
    } else if (wordBounds.top < bounds.top + 20) {
      container.scrollTop += wordBounds.top - bounds.top - 40;
    }
  }, [cursor, running]);
  const activeFindings = tab === "flags" ? metrics.flags : metrics.links;
  const codeLines = [
    "graph = load(second_brain)",
    "spider = Crawler(prompt)",
    "",
    "for word in spider.walk():",
    "  kind = classify(word)",
    "  match = graph.resolve(word)",
    "  if match: link(word, match)",
    "  else: flag(word)",
  ];
  return (
    <div className="app-shell">
      <aside className="rail">
        <a
          href="#"
          className="brand-mark"
          title="Prompt Spider home"
          onClick={(e) => {
            e.preventDefault();
            setModal(null);
          }}
        >
          <SpiderMark size={27} />
        </a>
        <div className="rail-top">
          <IconButton
            label="Prompt workspace"
            className="active"
            onClick={() => {
              setModal(null);
              setInspect(null);
            }}
          >
            <Network size={20} />
          </IconButton>
          <IconButton
            label="Second brain"
            onClick={() => setModal("knowledge")}
          >
            <Database size={19} />
          </IconButton>
          <IconButton label="Crawl history" onClick={() => setModal("history")}>
            <History size={19} />
          </IconButton>
          <span className="rail-separator" />
          <IconButton
            label="New prompt"
            onClick={() => {
              setDraft("");
              setModal("prompt");
            }}
          >
            <Plus size={20} />
          </IconButton>
        </div>
        <div className="rail-bottom">
          <IconButton label="How it works" onClick={() => setModal("help")}>
            <CircleHelp size={19} />
          </IconButton>
          <IconButton
            label="Workspace settings"
            onClick={() => setModal("settings")}
          >
            <Settings2 size={19} />
          </IconButton>
          <button
            className="avatar"
            onClick={() => setModal("settings")}
            title="Local workspace"
          >
            JD
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span className="wordmark">
              prompt spider<span className="brand-period">.</span>
            </span>
            <span className="breadcrumb-slash">/</span>
            <button onClick={() => setModal("settings")}>
              Personal workspace <ChevronDown size={12} />
            </button>
            <span className="workspace-badge">LOCAL</span>
          </div>
          <div className="topbar-right">
            <span className="privacy-label">
              <ShieldCheck size={13} /> Your context stays yours
            </span>
            <button className="help-link" onClick={() => setModal("help")}>
              How it works <ArrowUpRight size={13} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="overline">LESS GUESSWORK. MORE CONTEXT.</div>
              <h1>
                Your prompt. Fully connected<span>.</span>
              </h1>
              <p>A second set of eyes. Your entire second brain.</p>
            </div>
            <div className="heading-actions">
              <button
                className="button secondary"
                onClick={() => setModal("knowledge")}
              >
                <Database size={14} /> Second brain{" "}
                <span className="button-count">{sources.length}</span>
              </button>
              <div className="export-wrap">
                <button
                  className="button secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExportOpen(!exportOpen);
                  }}
                >
                  <ArrowDownToLine size={14} /> Export context{" "}
                  <ChevronDown size={12} />
                </button>
                {exportOpen && (
                  <div className="dropdown">
                    <button onClick={() => exportData("json")}>
                      <Braces size={15} /> Export as JSON
                    </button>
                    <button onClick={() => exportData("md")}>
                      <FileText size={15} /> Export as Markdown
                    </button>
                    <p>
                      {cursor < metrics.total
                        ? "Exports the current partial crawl."
                        : "Complete context package."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
          <section className="workspace">
            <div className="workspace-toolbar">
              <div className="file-tab">
                <FileText size={15} />
                <span>studio.prompt</span>
                <span className="unsaved-dot" />
                <span className="file-word-count">{metrics.total} words</span>
              </div>
              <div className="session-controls">
                <span className="session-label">
                  <i />{" "}
                  {cursor >= metrics.total
                    ? "CRAWL COMPLETE"
                    : running
                      ? "CRAWL IN PROGRESS"
                      : "READY TO EXPLORE"}
                </span>
                <IconButton label="Reset crawl" onClick={restart}>
                  <RotateCcw size={14} />
                </IconButton>
                <button className="button run-button" onClick={run}>
                  {running ? (
                    <Pause size={13} fill="currentColor" />
                  ) : (
                    <Play size={13} fill="currentColor" />
                  )}
                  {running
                    ? "Pause crawl"
                    : cursor >= metrics.total
                      ? "Run again"
                      : "Resume crawl"}
                </button>
              </div>
            </div>
            <nav className="section-nav" aria-label="Prompt sections">
              {analysis.sections.map((s, i) => {
                const done = s.tokens.length && s.tokens.at(-1).index < cursor;
                return (
                  <button
                    key={i}
                    onClick={() => selectSection(i)}
                    className={`${i === activeSection ? "active" : ""} ${done ? "done" : ""}`}
                    style={{ "--section-color": s.color }}
                  >
                    <span className="section-nav-number">
                      {done ? (
                        <Check size={10} />
                      ) : (
                        String(i + 1).padStart(2, "0")
                      )}
                    </span>
                    {s.name}
                    <span className="section-nav-line" />
                  </button>
                );
              })}
            </nav>
            <div className="workspace-body">
              <section className="prompt-panel">
                <div className="panel-heading">
                  <h2>
                    <FileText size={13} /> The prompt
                  </h2>
                  <button
                    className="text-button"
                    onClick={() => {
                      setDraft(prompt);
                      setModal("prompt");
                    }}
                  >
                    Edit <ArrowUpRight size={12} />
                  </button>
                </div>
                <div className="prompt-note">
                  <span className="live-dot" /> Original words. Deeper
                  understanding.
                </div>
                <div className="prompt-scroll" ref={promptRef}>
                  {analysis.sections.map((s, i) => (
                    <div
                      id={`section-${i}`}
                      key={i}
                      className={`prompt-section ${i === activeSection ? "current" : ""}`}
                    >
                      <button
                        className="prompt-section-title"
                        onClick={() => selectSection(i)}
                        style={{ "--section-color": s.color }}
                      >
                        <span>{String(i + 1).padStart(2, "0")}</span>
                        {s.name.toUpperCase()}
                        {s.tokens.at(-1)?.index < cursor ? (
                          <Check size={10} />
                        ) : i === activeSection ? (
                          <span className="section-active-dot" />
                        ) : null}
                      </button>
                      <p>
                        {s.tokens.map((t) => {
                          const read = t.index < cursor;
                          return (
                            <React.Fragment key={t.index}>
                              <button
                                className={`word ${read ? "read" : "unread"} ${read && t.findingId ? t.status : ""} ${t.index === cursor ? "reading" : ""}`}
                                style={
                                  read && t.findingId
                                    ? { "--token-color": TYPES[t.type] }
                                    : {}
                                }
                                onClick={() => {
                                  const finding = analysis.findings.find(
                                    (f) => f.id === t.findingId,
                                  );
                                  setInspect(
                                    finding || {
                                      id: `token-${t.index}`,
                                      phrase: t.text,
                                      type: t.type,
                                      status: read ? "read" : "unread",
                                      section: s.name,
                                      reason: read
                                        ? "Read as a statement or connective word. No explicit source alias or ambiguity rule matched this word."
                                        : "This word has not been read yet. Resume the crawl to classify it.",
                                      confidence: null,
                                    },
                                  );
                                }}
                              >
                                {t.text}
                              </button>{" "}
                            </React.Fragment>
                          );
                        })}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="prompt-footer">
                  <ShieldCheck size={12} />
                  <span>Not a single word rewritten.</span>
                  <span className="tiny-pink">0 edits</span>
                </div>
              </section>
              <div className="center-panel">
                <Graph
                  activeSection={activeSection}
                  sections={analysis.sections}
                  running={running}
                  cursor={cursor}
                  total={metrics.total}
                  onSelectSection={selectSection}
                  onInspect={setInspect}
                  findings={analysis.findings}
                  speed={speed}
                  onReadRate={setReadRate}
                  onEnterSection={(index) => {
                    setSelectedSection(null);
                    setCursor(analysis.sections[index]?.tokens[0]?.index || 0);
                    setRunning(true);
                    savedRun.current = false;
                  }}
                  onAdvance={() => {
                    setSelectedSection(null);
                    setCursor((c) => Math.min(c + 1, analysis.tokens.length));
                  }}
                  onToggleRun={run}
                  onSeek={(position) => {
                    setCursor(position);
                    setRunning(false);
                    setSelectedSection(null);
                  }}
                  onChangeSpeed={() =>
                    setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))
                  }
                />
                <div className="crawl-status">
                  <div className="current-section">
                    <span
                      className={`crawler-status-icon ${running ? "is-running" : ""}`}
                    >
                      <SpiderMark size={22} />
                    </span>
                    <div>
                      <span className="current-title">
                        {String(activeSection + 1).padStart(2, "0")}{" "}
                        <b>
                          {analysis.sections[activeSection]?.name.toUpperCase()}
                        </b>
                        <span className="status-badge">
                          {cursor >= metrics.total
                            ? "COMPLETE"
                            : running
                              ? "CRAWLING"
                              : "PAUSED"}
                        </span>
                      </span>
                      <p>{analysis.sections[activeSection]?.description}</p>
                    </div>
                  </div>
                  <div className="crawl-rate">
                    <Activity size={12} />
                    {running ? readRate.toFixed(1) : "0.0"}{" "}
                    <span>words / sec</span>
                  </div>
                </div>
              </div>
              <aside className="insights-panel">
                <div className="panel-heading">
                  <h2>Specificity score</h2>
                  <IconButton
                    label="About the specificity score"
                    onClick={() => setModal("score")}
                  >
                    <Info size={13} />
                  </IconButton>
                </div>
                <ScoreGauge score={metrics.score} />
                <div className="score-caption">
                  <span className="score-change">
                    <ArrowUpRight size={12} /> +{metrics.score - 37}
                  </span>
                  <span>from 37 before context</span>
                </div>
                <ScoreHistory
                  analysis={analysis}
                  cursor={cursor}
                  score={metrics.score}
                />
                <div className="findings-tabs">
                  <button
                    className={tab === "flags" ? "active" : ""}
                    onClick={() => setTab("flags")}
                  >
                    <Flag size={12} /> To clarify{" "}
                    <span>{metrics.flags.length}</span>
                  </button>
                  <button
                    className={tab === "links" ? "active" : ""}
                    onClick={() => setTab("links")}
                  >
                    <Link2 size={12} /> Linked{" "}
                    <span>{metrics.links.length}</span>
                  </button>
                </div>
                <div className="findings-list">
                  {activeFindings.length ? (
                    activeFindings.map((f, i) => (
                      <button
                        className="finding"
                        key={f.id}
                        onClick={() => setInspect(f)}
                      >
                        <span
                          className={`finding-symbol ${tab === "links" ? "linked" : ""}`}
                        >
                          {tab === "flags" ? (
                            <Flag size={12} />
                          ) : (
                            <Link2 size={12} />
                          )}
                        </span>
                        <span className="finding-content">
                          <b>{f.phrase}</b>
                          <small>
                            {tab === "flags"
                              ? f.question
                              : f.source?.title || "Your clarification"}
                          </small>
                        </span>
                        <ChevronRight size={13} />
                      </button>
                    ))
                  ) : (
                    <div className="empty-findings">
                      <CheckCheck size={23} />
                      <b>
                        {tab === "flags"
                          ? "Nothing to clarify yet"
                          : "No links yet"}
                      </b>
                      <p>
                        {tab === "flags"
                          ? "Keep crawling to check the rest of your prompt."
                          : "Add knowledge or keep crawling to discover matches."}
                      </p>
                    </div>
                  )}
                </div>
                <button className="ask-rule" onClick={() => setModal("help")}>
                  <ShieldCheck size={13} />
                  <span>Ask, don’t guess.</span>
                  <b>
                    0 <span>words guessed</span>
                  </b>
                </button>
              </aside>
            </div>
            <div className="timeline">
              <button
                className="timeline-play"
                onClick={run}
                title={running ? "Pause" : "Play"}
                aria-label={running ? "Pause timeline" : "Play timeline"}
              >
                {running ? (
                  <Pause size={13} fill="currentColor" />
                ) : (
                  <Play size={13} fill="currentColor" />
                )}
              </button>
              <span className="timeline-label">CRAWL PROGRESS</span>
              <input
                aria-label="Crawl timeline"
                type="range"
                min="0"
                max={metrics.total}
                value={cursor}
                style={{ "--progress": `${metrics.coverage * 100}%` }}
                onChange={(e) => {
                  setCursor(Number(e.target.value));
                  setRunning(false);
                  setSelectedSection(null);
                }}
              />
              <span className="timeline-count">
                {cursor}
                <span> / {metrics.total} words</span>
              </span>
              <button
                className="speed-button"
                title="Change playback speed"
                onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
              >
                {speed}× <ChevronDown size={10} />
              </button>
            </div>
          </section>
          <div className="telemetry-strip">
            <div>
              <span className="telemetry-icon">
                <ScanIcon />
              </span>
              <span>Words read</span>
              <b>
                {cursor}
                <small> / {metrics.total}</small>
              </b>
            </div>
            <div>
              <Link2 size={14} />
              <span>Context links</span>
              <b>{metrics.links.length}</b>
              <span className="metric-label">grounded in your knowledge</span>
            </div>
            <div>
              <Flag size={14} />
              <span>Open questions</span>
              <b>{metrics.flags.length}</b>
            </div>
            <div>
              <ShieldCheck size={14} />
              <span>Words guessed</span>
              <b className="green-text">0</b>
              <span className="zero-badge">Always.</span>
            </div>
          </div>
          <div className="bottom-grid">
            <section className="telemetry-card log-card">
              <div className="panel-heading">
                <h2>
                  <Terminal size={13} /> Crawl log
                </h2>
                <span className="panel-micro">
                  LIVE FEED <i className={running ? "live-dot" : ""} />
                </span>
              </div>
              <div className="log-lines">
                <div>
                  <span className="log-number">001</span>
                  <span className="log-action load">load</span>
                  <p>
                    Second brain <span>· {sources.length} sources indexed</span>
                  </p>
                  <Check size={11} />
                </div>
                {metrics.visible.slice(-4).map((f, i) => (
                  <button key={f.id} onClick={() => setInspect(f)}>
                    <span className="log-number">
                      {String(
                        Math.max(2, metrics.visible.length - 2 + i),
                      ).padStart(3, "0")}
                    </span>
                    <span
                      className={`log-action ${f.status === "resolved" ? "link" : "flag"}`}
                    >
                      {f.status === "resolved" ? "link" : "flag"}
                    </span>
                    <p>
                      {f.phrase}{" "}
                      <span>
                        {f.status === "resolved"
                          ? "→ " + (f.source?.title || "clarified")
                          : "→ needs context"}
                      </span>
                    </p>
                    {f.status === "resolved" ? (
                      <Check size={11} />
                    ) : (
                      <Flag size={10} />
                    )}
                  </button>
                ))}
                {metrics.visible.length < 2 && (
                  <div className="log-awaiting">
                    Waiting for the spider to explore…
                  </div>
                )}
              </div>
            </section>
            <section className="telemetry-card coverage-card">
              <div className="panel-heading">
                <h2>Section coverage</h2>
                <span className="panel-micro">
                  {Math.round(metrics.coverage * 100)}%
                </span>
              </div>
              <div className="coverage-body">
                <Radar analysis={analysis} cursor={cursor} />
                <div className="coverage-bars">
                  {analysis.sections.slice(0, 4).map((s) => {
                    const p =
                      s.tokens.filter((t) => t.index < cursor).length /
                      (s.tokens.length || 1);
                    return (
                      <button
                        key={s.index}
                        onClick={() => selectSection(s.index)}
                      >
                        <span>{s.name}</span>
                        <div>
                          <i
                            style={{
                              width: `${p * 100}%`,
                              background: s.color,
                            }}
                          />
                        </div>
                        <small>{Math.round(p * 100)}%</small>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
            <section className="telemetry-card heat-card">
              <div className="panel-heading">
                <h2>Word heat</h2>
                <span className="panel-micro">BY CLASSIFICATION</span>
              </div>
              <div className="heat-grid">
                {analysis.tokens.map((t, i) => (
                  <button
                    key={i}
                    aria-label={`${t.text}: ${t.index < cursor ? t.type : "unread"}`}
                    title={`${t.text} · ${t.index < cursor ? t.type : "unread"}`}
                    style={{
                      background:
                        t.index < cursor
                          ? t.findingId
                            ? TYPES[t.type]
                            : "#51505c"
                          : "#27282d",
                      opacity:
                        t.index < cursor ? (t.findingId ? 0.9 : 0.65) : 0.65,
                    }}
                    onClick={() =>
                      setInspect(
                        analysis.findings.find((f) => f.id === t.findingId) || {
                          phrase: t.text,
                          type: t.type,
                          section: analysis.sections[t.section]?.name,
                          status: t.index < cursor ? "read" : "unread",
                          reason:
                            "A prompt word with no exact knowledge alias match. No context has been invented.",
                        },
                      )
                    }
                  />
                ))}
              </div>
              <div className="heat-legend">
                {Object.entries(TYPES).map(([name, color]) => (
                  <span key={name}>
                    <i style={{ background: color }} />
                    {name === "file" ? "source" : name}
                  </span>
                ))}
              </div>
            </section>
            <section className="telemetry-card code-card">
              <div className="panel-heading">
                <h2>
                  <Code2 size={13} /> crawler.py
                </h2>
                <span className="panel-micro">PSEUDOCODE</span>
              </div>
              <div className="code-lines">
                {codeLines.map((line, i) => (
                  <div
                    key={i}
                    className={
                      i === (running ? 4 + (cursor % 4) : 3) ? "active" : ""
                    }
                  >
                    <span>{i + 1}</span>
                    <code>
                      {line
                        .split(
                          /(for|in|if|else|load|Crawler|classify|resolve|link|flag)/g,
                        )
                        .map((part, j) => (
                          <span
                            key={j}
                            className={
                              /^(for|in|if|else)$/.test(part)
                                ? "keyword"
                                : /^(load|Crawler|classify|resolve|link|flag)$/.test(
                                      part,
                                    )
                                  ? "function"
                                  : ""
                            }
                          >
                            {part}
                          </span>
                        ))}
                    </code>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <footer className="page-footer">
            <span>
              <span className="live-dot" /> All systems local <i /> No external
              model calls
            </span>
            <span>
              Built for the context you already have. <SpiderMark size={13} />
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={15} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {inspect && (
        <Modal
          title={`“${inspect.phrase}”`}
          subtitle={`${inspect.section} · Token inspection`}
          onClose={() => setInspect(null)}
        >
          <div className="inspection-badges">
            <span className={`tag ${inspect.status}`}>
              {inspect.status === "flagged" ? (
                <Flag size={12} />
              ) : inspect.status === "resolved" ? (
                <Link2 size={12} />
              ) : (
                <FileText size={12} />
              )}{" "}
              {inspect.status}
            </span>
            <span className="tag">{inspect.type}</span>
            {inspect.confidence !== null &&
              inspect.confidence !== undefined && (
                <span className="tag">
                  Exact {inspect.answer ? "clarification" : "alias"} match
                </span>
              )}
          </div>
          <div className="detail-block">
            <label>WHY THIS CLASSIFICATION</label>
            <p>{inspect.reason}</p>
          </div>
          {inspect.source && (
            <div className="source-evidence">
              <span>
                <FileText size={15} />
                {inspect.source.title}
              </span>
              <small>{inspect.source.path}</small>
              <p>{inspect.source.content}</p>
            </div>
          )}
          {inspect.question && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!answerDraft.trim()) return;
                setAnswers((a) => ({ ...a, [inspect.id]: answerDraft.trim() }));
                setInspect(null);
                notify(
                  "Clarification linked. No changes to your original prompt.",
                );
              }}
            >
              <div className="detail-block">
                <label>YOUR CLARIFICATION</label>
                <p>{inspect.question}</p>
                <textarea
                  autoFocus
                  rows="3"
                  placeholder="Add the missing context. Your words become the source."
                  value={answerDraft}
                  onChange={(e) => setAnswerDraft(e.target.value)}
                  required
                />
              </div>
              <button
                className="button primary"
                type="submit"
                disabled={!answerDraft.trim()}
              >
                <Link2 size={14} />
                {inspect.answer
                  ? "Update clarification"
                  : "Resolve with context"}
              </button>
            </form>
          )}
        </Modal>
      )}
      {modal === "prompt" && (
        <Modal
          title="Give the spider something to explore."
          subtitle="Your prompt stays yours. We'll connect context, not rewrite it."
          onClose={() => setModal(null)}
          wide
        >
          <label className="form-label" htmlFor="prompt-editor">
            PROMPT <span>Use # headings to separate sections</span>
          </label>
          <textarea
            id="prompt-editor"
            className="prompt-editor"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              "# Role\nYou are a creative strategist…\n\n# Objective\nWhat would you like to accomplish?"
            }
            maxLength={30000}
          />
          <div className="modal-footer">
            <button
              className="text-button"
              onClick={() => setDraft(DEMO_PROMPT)}
            >
              Load sample prompt
            </button>
            <span>
              {draft.trim() ? draft.trim().split(/\s+/).length : 0} words
            </span>
            <button
              className="button primary"
              disabled={!draft.trim()}
              onClick={() => {
                setPrompt(draft.trim());
                setAnswers({});
                setCursor(0);
                setSelectedSection(null);
                savedRun.current = false;
                setRunning(true);
                setModal(null);
                notify("New prompt loaded. Starting a fresh crawl.");
              }}
            >
              <SpiderMark size={17} /> Start crawl
            </button>
          </div>
        </Modal>
      )}
      {modal === "knowledge" && (
        <Modal
          title="Your second brain"
          subtitle="Real context. Explicit connections. Nothing made up."
          onClose={() => setModal(null)}
          wide
        >
          <div className="knowledge-summary">
            <span>
              <Database size={18} />
              <b>{sources.length}</b> indexed sources
            </span>
            <span className="local-badge">
              <ShieldCheck size={12} /> Stored on this device
            </span>
          </div>
          <div className="knowledge-toolbar">
            <div className="search-input">
              <Search size={15} />
              <input
                aria-label="Search knowledge sources"
                placeholder="Search your knowledge…"
                value={sourceQuery}
                onChange={(e) => setSourceQuery(e.target.value)}
              />
            </div>
            <button
              className="button secondary"
              onClick={() => fileRef.current.click()}
            >
              <Upload size={14} /> Import .txt
            </button>
            <button
              className="button primary"
              onClick={() => setSourceForm(!sourceForm)}
            >
              {sourceForm ? <X size={14} /> : <Plus size={14} />}{" "}
              {sourceForm ? "Cancel" : "Add source"}
            </button>
            <input
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              ref={fileRef}
              onChange={importFile}
              hidden
            />
          </div>
          {sourceForm ? (
            <form className="source-form" onSubmit={addSource}>
              <label>
                Source title
                <input
                  required
                  value={sourceTitle}
                  onChange={(e) => setSourceTitle(e.target.value)}
                  placeholder="e.g. Collection 04 · Approved budget"
                />
              </label>
              <label>
                Match these phrases{" "}
                <small>Comma-separated, exact phrase aliases</small>
                <input
                  required
                  value={sourceAliases}
                  onChange={(e) => setSourceAliases(e.target.value)}
                  placeholder="within budget, production budget"
                />
              </label>
              <label>
                Source content
                <textarea
                  required
                  rows="4"
                  value={sourceContent}
                  onChange={(e) => setSourceContent(e.target.value)}
                  placeholder="The actual decision, fact, or context. Include only what you know."
                />
              </label>
              <button type="submit" className="button primary">
                <Plus size={14} /> Index source
              </button>
            </form>
          ) : (
            <div className="source-list">
              {sources
                .filter((s) =>
                  (s.title + " " + s.content)
                    .toLowerCase()
                    .includes(sourceQuery.toLowerCase()),
                )
                .map((s) => (
                  <details key={s.id}>
                    <summary>
                      <span className="source-icon">
                        <FileText size={17} />
                      </span>
                      <span>
                        <b>{s.title}</b>
                        <small>{s.path}</small>
                      </span>
                      <span className="source-kind">{s.kind}</span>
                      <ChevronDown size={14} />
                    </summary>
                    <div>
                      <p>{s.content}</p>
                      <small>EXPLICIT ALIASES</small>
                      <div className="alias-list">
                        {s.aliases.map((a) => (
                          <span key={a}>{a}</span>
                        ))}
                      </div>
                      <button
                        className="text-button danger"
                        onClick={() => {
                          setSources((old) => old.filter((x) => x.id !== s.id));
                          notify(
                            "Source removed. Its matches have been re-evaluated.",
                          );
                        }}
                      >
                        Remove source
                      </button>
                    </div>
                  </details>
                ))}
              {!sources.some((s) =>
                (s.title + " " + s.content)
                  .toLowerCase()
                  .includes(sourceQuery.toLowerCase()),
              ) && <p className="modal-empty">No sources match your search.</p>}
            </div>
          )}
          <div className="knowledge-disclaimer">
            <Info size={13} /> Demo sources are illustrative. Add your own notes
            to ground your actual prompt.
          </div>
        </Modal>
      )}
      {modal === "score" && (
        <Modal
          title="Specificity, made visible."
          subtitle="A transparent heuristic. Not a prediction of model performance."
          onClose={() => setModal(null)}
        >
          <div className="score-explanation">
            <div>
              <span>Starting baseline</span>
              <b>37</b>
            </div>
            <div>
              <span>
                Read coverage{" "}
                <small>{Math.round(metrics.coverage * 100)}% × 18 points</small>
              </span>
              <b>+{(metrics.coverage * 18).toFixed(1)}</b>
            </div>
            <div>
              <span>
                Resolved context{" "}
                <small>
                  {metrics.links.length} / {analysis.findings.length} identified
                  findings × 45 points
                </small>
              </span>
              <b>
                +
                {(analysis.findings.length
                  ? (metrics.links.length / analysis.findings.length) * 45
                  : 0
                ).toFixed(1)}
              </b>
            </div>
            <div className="score-total">
              <span>Your spec score</span>
              <b>{metrics.score} / 100</b>
            </div>
          </div>
          <p className="modal-copy">
            Only exact aliases in your knowledge base and your explicit
            clarifications count as resolved. Unmatched language is not silently
            filled in. The score is an exploratory signal, not a comprehensive
            factual or quality audit.
          </p>
        </Modal>
      )}
      {modal === "history" && (
        <Modal
          title="Crawl history"
          subtitle="Completed explorations from this device."
          onClose={() => setModal(null)}
        >
          {history.length ? (
            <div className="history-list">
              {history.map((h, i) => (
                <div key={i}>
                  <span>
                    <FileText size={18} />
                  </span>
                  <div>
                    <b>studio.prompt</b>
                    <small>
                      {new Date(h.date).toLocaleString()} · {h.words} words
                    </small>
                    <p>
                      {h.links} links · {h.flags} open questions
                    </p>
                  </div>
                  <strong>
                    {h.score}
                    <small>/100</small>
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="large-empty">
              <History size={34} />
              <h3>A fresh start.</h3>
              <p>
                Finish your first crawl and it will appear here.
                <br />
                Your history stays on this device.
              </p>
              <button
                className="button primary"
                onClick={() => {
                  setModal(null);
                  setRunning(true);
                }}
              >
                <Play size={14} /> Continue crawl
              </button>
            </div>
          )}
        </Modal>
      )}
      {modal === "help" && (
        <Modal
          title="A second set of eyes."
          subtitle="Your prompt isn't bad. It might just be missing context."
          onClose={() => setModal(null)}
        >
          <div className="help-steps">
            {[
              [
                FileText,
                "01",
                "Give it your prompt",
                "Start with your own words, or explore the sample studio brief. Headings become sections in the graph.",
              ],
              [
                Database,
                "02",
                "Connect what you know",
                "Add notes and explicit match phrases to your second brain. The demo includes 10 illustrative sources.",
              ],
              [
                SpiderMark,
                "03",
                "Let the spider explore",
                "Watch a local, deterministic crawl identify source matches and common ambiguity. Pause, scrub, or click any word to inspect it.",
              ],
              [
                Flag,
                "04",
                "Only answer what’s missing",
                "Resolve flags with your own clarification, then export the original prompt with its grounded context.",
              ],
            ].map(([Icon, num, title, text]) => (
              <div key={num}>
                <span>
                  <Icon size={18} />
                </span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
                <small>{num}</small>
              </div>
            ))}
          </div>
          <div className="help-principle">
            <ShieldCheck size={17} />
            <p>
              <b>Ask, don’t guess.</b> No external AI calls. No automatic
              rewriting. The rule-based demo is not a complete semantic
              understanding system.
            </p>
          </div>
        </Modal>
      )}
      {modal === "settings" && (
        <Modal
          title="Personal workspace"
          subtitle="A quiet place for your prompt and its context."
          onClose={() => setModal(null)}
        >
          <div className="settings-row">
            <span>
              <b>Local-first storage</b>
              <small>
                Prompts, sources, and history are saved in this browser.
              </small>
            </span>
            <span className="tag resolved">Enabled</span>
          </div>
          <div className="settings-row">
            <span>
              <b>External model calls</b>
              <small>This version uses explicit phrase matching only.</small>
            </span>
            <span className="tag">None</span>
          </div>
          <div className="settings-row">
            <span>
              <b>Playback speed</b>
              <small>Words are read sequentially at the selected rate.</small>
            </span>
            <select
              aria-label="Playback speed"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={4}>4×</option>
            </select>
          </div>
          <div className="settings-warning">
            <p>
              Restore the sample workspace? This replaces your prompt, sources,
              and clarifications. Crawl history is kept.
            </p>
            <button
              className="button secondary"
              onClick={() => setModal("confirm-reset")}
            >
              <RotateCcw size={14} /> Restore sample workspace
            </button>
          </div>
        </Modal>
      )}
      {modal === "confirm-reset" && (
        <Modal
          title="Restore the sample workspace?"
          subtitle="Your current prompt, sources, and clarifications will be replaced."
          onClose={() => setModal(null)}
        >
          <p className="modal-copy">
            Export your context first if you would like to keep a copy. Your
            completed crawl history will not be deleted.
          </p>
          <div className="modal-footer">
            <button
              className="button secondary"
              onClick={() => setModal("settings")}
            >
              Cancel
            </button>
            <button
              className="button primary"
              onClick={() => {
                setPrompt(DEMO_PROMPT);
                setSources(INITIAL_SOURCES);
                setAnswers({});
                setCursor(0);
                setRunning(false);
                setSelectedSection(null);
                savedRun.current = false;
                setModal(null);
                notify("Sample workspace restored.");
              }}
            >
              Restore sample
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function ScanIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M5 2H2v3M11 2h3v3M2 11v3h3M14 11v3h-3M5 6h6M5 9h6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

createRoot(document.getElementById("root")).render(<App />);

export const SECTION_META = [
  { name: "Role", color: "#73c4bc", description: "who the studio works for" },
  {
    name: "Objective",
    color: "#9bcad4",
    description: "what success looks like",
  },
  {
    name: "Context",
    color: "#e1a3c4",
    description: "the knowledge behind the words",
  },
  { name: "Roles", color: "#d3bd7c", description: "who owns what" },
  {
    name: "Rules",
    color: "#99bb8a",
    description: "the boundaries to work within",
  },
  {
    name: "Review",
    color: "#ae9bcc",
    description: "how the work gets approved",
  },
  { name: "Start", color: "#dca981", description: "the first step forward" },
  { name: "Ship", color: "#a4b9cc", description: "ready for the next step" },
];

export const DEMO_PROMPT = `# Role
You are a creative strategist for our studio. Help us turn ambitious ideas into thoughtful, useful work that feels unmistakably like us.

# Objective
Create a launch plan for the new collection. Build awareness with our audience and make the campaign feel fresh, cohesive, and ready for launch. Make every recommendation practical, with enough detail for a small team to act confidently.

# Context
Use our brand guidelines and the latest research. Reference the previous campaign, our positioning, and the project brief. Keep the tone consistent with our voice.

# Roles
Alex owns creative direction. Sarah leads the content. The design team handles visual assets. Route final decisions to the project owner.

# Rules
Stay within budget. Use approved assets only. Follow our accessibility standards. Do not make unsupported claims. Ask when something is unclear.

# Review
Share a first draft with the team. Get stakeholder approval before production. Check all claims against source material.

# Start
Begin with the core concept and a simple timeline. Identify dependencies, open questions, and what you need from us.

# Ship
Deliver the final plan, creative direction, and next steps. Include owners and clear milestones. Flag anything unresolved.`;

export const INITIAL_SOURCES = [
  {
    id: "brand",
    title: "Brand guidelines v2.4",
    kind: "File",
    path: "Studio / Brand / Guidelines",
    content:
      "Our studio is Forma, an independent design studio. Our voice is clear, considered, and quietly confident. Use warm neutrals, editorial typography, and human-centered imagery.",
    aliases: ["our studio", "brand guidelines", "our voice", "tone", "like us"],
    updated: "2 hours ago",
  },
  {
    id: "brief",
    title: "Collection launch · Project brief",
    kind: "File",
    path: "Projects / Collection 04 / Brief",
    content:
      "Collection 04 is a set of modular objects for considered living. The launch goal is 2,000 qualified waitlist signups. Deliver a launch plan, creative direction, and a four-week content calendar.",
    aliases: ["new collection", "project brief", "launch plan", "core concept"],
    updated: "Yesterday",
  },
  {
    id: "research",
    title: "Audience research · Q3",
    kind: "File",
    path: "Research / Audience / Q3 2026",
    content:
      "Our audience is design-conscious independent professionals aged 28–45. They value durable materials, thoughtful details, and flexible spaces.",
    aliases: ["latest research", "our audience", "research", "source material"],
    updated: "3 days ago",
  },
  {
    id: "campaign",
    title: "Collection 03 · Retrospective",
    kind: "File",
    path: "Projects / Collection 03 / Retrospective",
    content:
      "The previous campaign focused on everyday rituals. Product process stories generated the highest engagement. Avoid repeating the same concept.",
    aliases: ["previous campaign"],
    updated: "1 week ago",
  },
  {
    id: "position",
    title: "Studio positioning",
    kind: "Claim",
    path: "Studio / Strategy / Positioning",
    content:
      "Forma creates useful objects with a quiet point of view. Positioning: fewer, better things designed to be lived with.",
    aliases: ["our positioning", "positioning"],
    updated: "2 days ago",
  },
  {
    id: "alex",
    title: "Alex Morgan · Creative lead",
    kind: "Owner",
    path: "People / Alex Morgan",
    content:
      "Alex Morgan owns creative direction and final visual decisions for Collection 04.",
    aliases: ["Alex", "creative direction"],
    updated: "Yesterday",
  },
  {
    id: "sarah",
    title: "Sarah Chen · Content lead",
    kind: "Owner",
    path: "People / Sarah Chen",
    content:
      "Sarah Chen leads editorial strategy and writes campaign copy. Content drafts are reviewed by Sarah before the team review.",
    aliases: ["Sarah", "the content"],
    updated: "Yesterday",
  },
  {
    id: "design",
    title: "Design team · Responsibilities",
    kind: "Owner",
    path: "Studio / Teams / Design",
    content:
      "Mika and Jordan own visual assets. Mika handles art direction and Jordan handles digital production.",
    aliases: ["design team", "visual assets"],
    updated: "4 days ago",
  },
  {
    id: "access",
    title: "Accessibility checklist",
    kind: "File",
    path: "Studio / Standards / Accessibility",
    content:
      "Meet WCAG 2.2 AA, with minimum 4.5:1 text contrast, descriptive alternative text, and reduced-motion support.",
    aliases: ["accessibility standards"],
    updated: "1 week ago",
  },
  {
    id: "assets",
    title: "Approved asset library",
    kind: "Approval",
    path: "Studio / Assets / Approved",
    content:
      "The Approved folder contains licensed product photography and the current identity kit. Only assets in this folder are cleared for publication.",
    aliases: ["approved assets"],
    updated: "2 hours ago",
  },
];

const VAGUE = [
  ["fresh", "What would make this campaign feel fresh?"],
  ["cohesive", "Which examples define a cohesive campaign?"],
  ["ready for launch", "What is the confirmed launch date?"],
  ["project owner", "Who is the final decision-maker for this project?"],
  ["within budget", "What is the approved production budget?"],
  ["the team", "Who should receive the first draft?"],
  ["stakeholder approval", "Who needs to approve the work, and by when?"],
  ["a first draft", "When is the first draft due?"],
  ["simple timeline", "What are the key dates and time constraints?"],
  ["clear milestones", "Which milestones need explicit sign-off?"],
  ["next steps", "What must happen immediately after delivery?"],
  ["thoughtful", "What measurable qualities define thoughtful work?"],
];
const ADDITIONAL_VAGUE =
  /\b(better|soon|quickly|appropriate|nice|good|some|someone|asap|latest|recent|relevant|improve|optimize|engaging|beautiful|best)\b/gi;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function parsePrompt(text) {
  const parts = text
    .trim()
    .split(/\n\s*(?=#\s|\d{1,2}[.)]\s)/)
    .filter(Boolean);
  let index = 0;
  return parts.map((part, i) => {
    const heading = part.match(/^(?:#\s*|\d{1,2}[.)]\s*)([^\n]+)\n?/);
    const name = heading
      ? heading[1].trim()
      : i === 0
        ? "Prompt"
        : `Section ${i + 1}`;
    const body = heading ? part.slice(heading[0].length).trim() : part.trim();
    const meta = SECTION_META.find(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    ) || {
      ...SECTION_META[i % 8],
      name,
      description: "understanding your prompt",
    };
    const tokens = [...body.matchAll(/\S+/g)].map((m) => ({
      text: m[0],
      start: m.index,
      end: m.index + m[0].length,
      index: index++,
      section: i,
      type: "claim",
      status: "read",
    }));
    return { ...meta, body, tokens, index: i };
  });
}

export function analyzePrompt(text, sources, answers = {}) {
  const sections = parsePrompt(text);
  const findings = [];
  for (const section of sections) {
    const occupied = new Set();
    const matchPhrase = (phrase, callback) => {
      const regex = new RegExp(
        `(?<![\\w])${escapeRegExp(phrase)}(?![\\w]|\\.[\\w])`,
        "gi",
      );
      for (const match of section.body.matchAll(regex)) {
        const tokens = section.tokens.filter(
          (t) => t.start < match.index + match[0].length && t.end > match.index,
        );
        if (!tokens.length || tokens.some((t) => occupied.has(t.index)))
          continue;
        tokens.forEach((t) => occupied.add(t.index));
        callback(match[0], tokens);
      }
    };
    const aliases = sources
      .flatMap((s) => s.aliases.map((a) => ({ alias: a, source: s })))
      .sort((a, b) => b.alias.length - a.alias.length);
    for (const { alias, source } of aliases)
      matchPhrase(alias, (phrase, tokens) => {
        const id = `${section.index}-${tokens[0].index}`;
        const finding = {
          id,
          phrase,
          section: section.name,
          sectionIndex: section.index,
          tokenIndex: tokens.at(-1).index,
          type: source.kind.toLowerCase(),
          status: "resolved",
          source,
          reason: `Exact phrase match to an explicitly indexed alias in ${source.title}.`,
          confidence: 100,
        };
        findings.push(finding);
        tokens.forEach((t) =>
          Object.assign(t, {
            type: finding.type,
            status: "resolved",
            findingId: id,
          }),
        );
      });
    const vaguePhrases = [...VAGUE];
    // Known reference syntax remains unresolved when its source is absent.
    // This is detection of missing evidence, never a fabricated resolution.
    for (const alias of INITIAL_SOURCES.flatMap((source) => source.aliases)) {
      vaguePhrases.push([
        alias,
        `Which source or explicit context defines “${alias}”?`,
      ]);
    }
    for (const match of section.body.matchAll(
      /\b([A-Z][a-z]+)\s+(?:owns|leads|approves|handles)\b/g,
    )) {
      vaguePhrases.push([
        match[1],
        `Who is ${match[1]}, and what is their responsibility?`,
      ]);
    }
    for (const match of section.body.matchAll(
      /\b[\w.-]+\.(?:pdf|md|txt|docx|csv|json)\b/gi,
    )) {
      vaguePhrases.push([
        match[0],
        `Where can “${match[0]}” be found, and what does it establish?`,
      ]);
    }
    for (const m of section.body.matchAll(ADDITIONAL_VAGUE))
      vaguePhrases.push([
        m[0],
        `What specifically does “${m[0]}” mean in this prompt?`,
      ]);
    for (const [phrase, question] of vaguePhrases.sort(
      (a, b) => b[0].length - a[0].length,
    ))
      matchPhrase(phrase, (matched, tokens) => {
        const id = `${section.index}-${tokens[0].index}`;
        const answer = answers[id];
        const finding = {
          id,
          phrase: matched,
          section: section.name,
          sectionIndex: section.index,
          tokenIndex: tokens.at(-1).index,
          type: answer ? "claim" : "vague",
          status: answer ? "resolved" : "flagged",
          question,
          answer,
          reason: answer
            ? "Explicit clarification supplied by you."
            : "No explicit match was found in your connected knowledge. Human clarification is needed.",
          confidence: answer ? 100 : null,
        };
        findings.push(finding);
        tokens.forEach((t) =>
          Object.assign(t, {
            type: finding.type,
            status: finding.status,
            findingId: id,
          }),
        );
      });
  }
  return {
    sections,
    tokens: sections.flatMap((s) => s.tokens),
    findings: findings.sort((a, b) => a.tokenIndex - b.tokenIndex),
  };
}

export function getMetrics(analysis, cursor) {
  const visible = analysis.findings.filter((f) => f.tokenIndex < cursor);
  const links = visible.filter((f) => f.status === "resolved");
  const flags = visible.filter((f) => f.status === "flagged");
  const total = analysis.tokens.length;
  const coverage = total ? Math.min(1, cursor / total) : 0;
  const resolvedRatio = analysis.findings.length
    ? links.length / analysis.findings.length
    : 0;
  const score = total ? Math.round(37 + coverage * 18 + resolvedRatio * 45) : 0;
  return {
    visible,
    links,
    flags,
    coverage,
    score,
    words: Math.min(cursor, total),
    total,
  };
}

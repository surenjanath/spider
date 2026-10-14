import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzePrompt,
  parsePrompt,
  getMetrics,
  DEMO_PROMPT,
  INITIAL_SOURCES,
} from "./engine.js";

test("sample contains 181 words across eight sequential sections", () => {
  const result = analyzePrompt(DEMO_PROMPT, INITIAL_SOURCES);
  assert.equal(result.tokens.length, 181);
  assert.equal(result.sections.length, 8);
  assert.deepEqual(
    result.tokens.map((t) => t.index),
    Array.from({ length: 181 }, (_, i) => i),
  );
  assert.equal(
    result.findings.filter((f) => f.status === "flagged").length,
    12,
  );
});

test("plain text and numbered headings are supported", () => {
  assert.equal(parsePrompt("A plain text prompt.")[0].name, "Prompt");
  assert.deepEqual(
    parsePrompt("1. Role\nA strategist.\n\n2. Objective\nCreate a plan.").map(
      (s) => s.name,
    ),
    ["Role", "Objective"],
  );
});

test("empty input has no tokens or fabricated score", () => {
  const result = analyzePrompt("", []);
  assert.equal(result.tokens.length, 0);
  assert.equal(getMetrics(result, 0).score, 0);
});

test("longest exact alias wins, case insensitively and at word boundaries", () => {
  const result = analyzePrompt(
    "Use our BRAND GUIDELINES and Alex. Not Alexandria.",
    INITIAL_SOURCES,
  );
  assert.equal(
    result.findings.filter((f) => f.source?.id === "brand").length,
    1,
  );
  assert.equal(
    result.findings.filter((f) => f.source?.id === "alex").length,
    1,
  );
  assert.equal(result.findings.filter((f) => f.status === "flagged").length, 0);
});

test("all resolutions carry explicit evidence", () => {
  const result = analyzePrompt(DEMO_PROMPT, INITIAL_SOURCES);
  result.findings
    .filter((f) => f.status === "resolved")
    .forEach((f) => {
      assert.ok(f.source.content);
      assert.ok(
        f.source.aliases.some(
          (a) => a.toLowerCase() === f.phrase.toLowerCase(),
        ),
      );
    });
});

test("a clarification resolves a flag without rewriting the prompt", () => {
  const prompt = "Make the campaign fresh.";
  const initial = analyzePrompt(prompt, []);
  const flag = initial.findings.find((f) => f.phrase === "fresh");
  const result = analyzePrompt(prompt, [], {
    [flag.id]: "Use behind-the-scenes product stories.",
  });
  assert.equal(result.findings[0].status, "resolved");
  assert.equal(
    result.findings[0].answer,
    "Use behind-the-scenes product stories.",
  );
  assert.equal(result.sections[0].body, prompt);
  assert.ok(
    getMetrics(result, result.tokens.length).score >
      getMetrics(initial, initial.tokens.length).score,
  );
});

test("live source injection resolves only explicit phrase matches", () => {
  const prompt = "Stay within budget.";
  const source = {
    id: "budget",
    title: "Budget approval",
    kind: "Approval",
    content: "Approved limit: $4,000.",
    aliases: ["within budget"],
  };
  assert.equal(analyzePrompt(prompt, []).findings[0].status, "flagged");
  const finding = analyzePrompt(prompt, [source]).findings[0];
  assert.equal(finding.status, "resolved");
  assert.equal(finding.source.id, "budget");
  assert.equal(finding.type, "approval");
});

test("missing known references and explicit file/owner syntax are flagged", () => {
  const result = analyzePrompt(
    "Use brand guidelines. Jamie owns research.pdf.",
    [],
  );
  assert.deepEqual(
    result.findings.map((f) => f.phrase),
    ["brand guidelines", "Jamie", "research.pdf"],
  );
  assert.ok(result.findings.every((f) => f.status === "flagged"));
});

test("metrics only include words and findings reached by the crawl", () => {
  const result = analyzePrompt(DEMO_PROMPT, INITIAL_SOURCES);
  const start = getMetrics(result, 0);
  assert.equal(start.score, 37);
  assert.equal(start.links.length, 0);
  assert.equal(start.flags.length, 0);
  const mid = getMetrics(result, 82);
  assert.ok(mid.visible.every((f) => f.tokenIndex < 82));
  assert.equal(mid.words, 82);
  const end = getMetrics(result, result.tokens.length);
  assert.equal(end.coverage, 1);
  assert.equal(end.links.length + end.flags.length, result.findings.length);
  assert.ok(end.score >= start.score && end.score <= 100);
});

test("aliases containing regex characters are matched literally", () => {
  const source = {
    id: "c",
    title: "Language",
    kind: "File",
    content: "C++20",
    aliases: ["C++"],
  };
  assert.equal(
    analyzePrompt("Use C++ for this.", [source]).findings[0].source.id,
    "c",
  );
});

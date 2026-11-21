// Copyright (c) 2026 StrataGlyph Contributors
// SPDX-License-Identifier: MIT
// Unit tests for validateSpecContract and sanitizeSvgAttribute.

import { describe, it, expect } from "vitest";
import { validateSpecContract, sanitizeSvgAttribute } from "../src/contract.js";

describe("validateSpecContract", () => {
  it("validates conforming specification with nodes and edges", () => {
    const spec = {
      title: "Three Tier Web Architecture",
      aspect: "16:9",
      nodes: [
        { id: "frontend_alb", label: "Application Load Balancer" },
        { id: "ecs_cluster", label: "ECS Fargate Microservices" },
        { id: "aurora_pg", label: "Aurora PostgreSQL DB" },
      ],
      edges: [
        { from: "frontend_alb", to: "ecs_cluster" },
        { from: "ecs_cluster", to: "aurora_pg" },
      ],
    };

    const res = validateSpecContract(spec);
    expect(res.valid).toBe(true);
    expect(res.errors.length).toBe(0);
  });

  it("rejects non-object root or missing nodes array", () => {
    expect(validateSpecContract(null).valid).toBe(false);
    expect(validateSpecContract("bad spec").valid).toBe(false);

    const missingNodes = { title: "Empty" };
    const res = validateSpecContract(missingNodes);
    expect(res.valid).toBe(false);
    expect(res.errors[0].code).toBe("MISSING_NODES");
  });

  it("rejects duplicate node identifiers and illegal characters", () => {
    const badSpec = {
      nodes: [
        { id: "web_server" },
        { id: "web_server" }, // duplicate
        { id: "db server with spaces!" }, // invalid format
      ],
    };

    const res = validateSpecContract(badSpec);
    expect(res.valid).toBe(false);

    const codes = res.errors.map((e) => e.code);
    expect(codes).toContain("DUPLICATE_NODE_ID");
    expect(codes).toContain("INVALID_ID_FORMAT");
  });

  it("detects dangling edge references to undeclared nodes", () => {
    const spec = {
      nodes: [{ id: "service_a" }],
      edges: [
        { from: "service_a", to: "phantom_target" },
        { from: "phantom_origin", to: "service_a" },
      ],
    };

    const res = validateSpecContract(spec);
    expect(res.valid).toBe(false);

    const codes = res.errors.map((e) => e.code);
    expect(codes).toContain("DANGLING_EDGE_TARGET");
    expect(codes).toContain("DANGLING_EDGE_ORIGIN");
  });

  it("validates aspect ratio format", () => {
    const badAspect = {
      aspect: "invalid-aspect",
      nodes: [{ id: "node1" }],
    };

    const res = validateSpecContract(badAspect);
    expect(res.valid).toBe(false);
    expect(res.errors[0].code).toBe("INVALID_ASPECT_RATIO");
  });
});

describe("sanitizeSvgAttribute", () => {
  it("strips script tags and inline event handlers", () => {
    const evil = 'Dashboard <script>alert("pwned")</script> view onload=bad()';
    const clean = sanitizeSvgAttribute(evil);
    expect(clean).not.toContain("<script>");
    expect(clean).not.toContain("onload=");
    expect(clean).toContain("Dashboard");
    expect(clean).toContain("view");
  });

  it("escapes XML entities safely", () => {
    const raw = 'Config & Parameters <v1.0> "active"';
    const escaped = sanitizeSvgAttribute(raw);
    expect(escaped).toBe("Config &amp; Parameters &lt;v1.0&gt; &quot;active&quot;");
  });

  it("handles empty or non-string inputs", () => {
    expect(sanitizeSvgAttribute("")).toBe("");
    expect(sanitizeSvgAttribute(null as any)).toBe("");
  });
});

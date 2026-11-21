// Copyright (c) 2026 StrataGlyph Contributors
// SPDX-License-Identifier: MIT
// Architecture Spec Schema Contract Validator, Identifier Namespace Enforcement & SVG Sanitizer.

export interface NodeSpec {
  id: string;
  label?: string;
  icon?: string;
  category?: string;
  tags?: string[];
}

export interface EdgeSpec {
  from: string;
  to: string;
  label?: string;
  constraint?: boolean;
}

export interface DiagramSpecContract {
  title?: string;
  version?: string;
  aspect?: string;
  nodes: NodeSpec[];
  edges?: EdgeSpec[];
}

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export interface ContractResult {
  valid: boolean;
  errors: ValidationIssue[];
}

const ID_REGEX = /^[a-zA-Z0-9_\-]+$/;
const ASPECT_REGEX = /^[0-9]+(\.[0-9]+)?(:[0-9]+(\.[0-9]+)?)?$/;
const XSS_PATTERN = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>|javascript:|data:text\/html|on[a-z]+\s*=/i;

/**
 * Validates spec structural contract, identifier constraints, and topological edge links.
 */
export function validateSpecContract(spec: unknown): ContractResult {
  const errors: ValidationIssue[] = [];

  if (!spec || typeof spec !== "object") {
    errors.push({ path: "$", code: "INVALID_SPEC_ROOT", message: "Spec must be a non-null object" });
    return { valid: false, errors };
  }

  const s = spec as Record<string, unknown>;

  // 1. Aspect Ratio Validation
  if (s.aspect !== undefined && s.aspect !== null) {
    if (typeof s.aspect !== "string" || !ASPECT_REGEX.test(s.aspect)) {
      errors.push({
        path: "$.aspect",
        code: "INVALID_ASPECT_RATIO",
        message: `Aspect ratio must match 'W:H' format (e.g. '16:9'), received: '${s.aspect}'`,
      });
    }
  }

  // 2. Nodes validation
  if (!Array.isArray(s.nodes)) {
    errors.push({ path: "$.nodes", code: "MISSING_NODES", message: "Spec must contain a 'nodes' array" });
    return { valid: false, errors };
  }

  const seenIds = new Set<string>();
  for (let i = 0; i < s.nodes.length; i++) {
    const node = s.nodes[i];
    const nodePath = `$.nodes[${i}]`;

    if (!node || typeof node !== "object") {
      errors.push({ path: nodePath, code: "INVALID_NODE", message: "Node must be an object" });
      continue;
    }

    const n = node as Record<string, unknown>;
    const id = n.id;

    if (typeof id !== "string" || id.trim().length === 0) {
      errors.push({ path: `${nodePath}.id`, code: "EMPTY_NODE_ID", message: "Node id must be non-empty string" });
      continue;
    }

    if (!ID_REGEX.test(id)) {
      errors.push({
        path: `${nodePath}.id`,
        code: "INVALID_ID_FORMAT",
        message: `Node id '${id}' contains illegal characters. Only [a-zA-Z0-9_-] allowed.`,
      });
    }

    if (id.length > 64) {
      errors.push({
        path: `${nodePath}.id`,
        code: "ID_TOO_LONG",
        message: `Node id '${id}' exceeds maximum length of 64 characters`,
      });
    }

    if (seenIds.has(id)) {
      errors.push({
        path: `${nodePath}.id`,
        code: "DUPLICATE_NODE_ID",
        message: `Duplicate node identifier '${id}' detected`,
      });
    } else {
      seenIds.add(id);
    }
  }

  // 3. Edges validation & topological link integrity
  if (s.edges !== undefined && s.edges !== null) {
    if (!Array.isArray(s.edges)) {
      errors.push({ path: "$.edges", code: "INVALID_EDGES", message: "'edges' must be an array" });
    } else {
      for (let j = 0; j < s.edges.length; j++) {
        const edge = s.edges[j];
        const edgePath = `$.edges[${j}]`;

        if (!edge || typeof edge !== "object") {
          errors.push({ path: edgePath, code: "INVALID_EDGE", message: "Edge must be an object" });
          continue;
        }

        const e = edge as Record<string, unknown>;
        const fromNode = e.from;
        const toNode = e.to;

        if (typeof fromNode !== "string" || !seenIds.has(fromNode)) {
          errors.push({
            path: `${edgePath}.from`,
            code: "DANGLING_EDGE_ORIGIN",
            message: `Edge origin '${fromNode}' does not reference any declared node in spec`,
          });
        }

        if (typeof toNode !== "string" || !seenIds.has(toNode)) {
          errors.push({
            path: `${edgePath}.to`,
            code: "DANGLING_EDGE_TARGET",
            message: `Edge target '${toNode}' does not reference any declared node in spec`,
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Strips dangerous XSS payloads, script tags, and event handlers from text attributes.
 */
export function sanitizeSvgAttribute(rawText: string): string {
  if (!rawText || typeof rawText !== "string") {
    return "";
  }

  let cleaned = rawText;
  while (XSS_PATTERN.test(cleaned)) {
    cleaned = cleaned.replace(XSS_PATTERN, "");
  }

  // Escape XML delimiter entities
  return cleaned
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .trim();
}

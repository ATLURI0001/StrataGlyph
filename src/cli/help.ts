// The version stamp and the help text that --help and every usage error print.
import { PACK_ORDER } from "../icons/index.ts";

declare const __VERSION__: string;
export const VERSION = typeof __VERSION__ === "string" ? __VERSION__ : "dev";

export const HELP = `strataglyph ${VERSION}: architecture and system design diagrams with official icons

Usage:
  strataglyph render <spec.yaml> [-o out] [-f svg,png,drawio,drawio.svg,tsx,html,mmd,sequence.svg|all]
                    [--theme light|dark|both] [--scale 3] [--skin classic|stage] [--animate packets|flow|relay|none]
                    [--static] [--font extra.ttf] [--view <name>|all]
                    [--strict] [--force] [--json]
  strataglyph validate <spec.yaml> [--strict] [--json]
  strataglyph review <spec.yaml> [-o out] [--width 880] [--theme light|dark] [--skin classic|stage]
                    [--strict] [--json]
  strataglyph icons search <words...> [--pack aws] [--type service] [--limit 15] [--json]
  strataglyph icons show <icon-id> [-o icon.svg|icon.png] [--theme dark]
  strataglyph icons list [--pack aws] [--category Compute] [--type service] [--json]
  strataglyph icons packs [--json]
  strataglyph icons fetch [pack...]
  strataglyph icons new <name> [--dir icons] [--force]
  strataglyph icons check <icon.svg> [-o sheet.png]
  strataglyph icons adopt <file.svg> --name <name> [--dir icons] [--force]
  strataglyph watch <spec.yaml> [-o out] [-f svg,png] [--theme dark] [--skin stage] [--animate ...]
                    [--scale 3] [--review] [--width 880]
  strataglyph patch <spec.yaml> <candidates.json|-> [-o best.yaml] [--width 880] [--theme dark]
                    [--skin classic|stage] [--json]
  strataglyph doc <design.md> [-o out.html|out.md|out.docx] [-f html,md,docx] [--theme light]
                    [--skin classic|stage]
  strataglyph mcp [--port 8765]
  strataglyph mcp install <claude-code|claude-desktop|cursor|vscode|gemini|codex|kiro> [project|user]
                    [--force] [--json]
  strataglyph mcp install --list
  strataglyph diff <before.yaml> <after.yaml> [-o changes.svg] [--json]
  strataglyph verify <spec.yaml> [--link] [--commit <sha>] [--json]
  strataglyph describe <spec.yaml> [--json]
  strataglyph lsp
  strataglyph styles [--json]
  strataglyph import <mermaid|terraform|cloudformation|cdk|compose|kubernetes|picture|sql> <file> [-o diagram.yaml]
  strataglyph init [template] [-o diagram.yaml] [--list]
  strataglyph doctor
  strataglyph demo [out-dir]

Packs: ${PACK_ORDER.join(", ")}. Spec reference: references/spec.md in the skill folder.
Exit codes: 0 ok, 1 diagram errors (or warnings with --strict), 2 bad command line.`;

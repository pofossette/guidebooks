import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";

const MARKDOWN_ROOTS = ["README.md", "docs"];
let mermaidParserPromise = null;
let domReady = false;

function setGlobalValue(key, value) {
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
    writable: true,
  });
}

function ensureBrowserLikeDom() {
  if (domReady) return;

  const { window } = new JSDOM("<!doctype html><html><body></body></html>");
  setGlobalValue("window", window);
  setGlobalValue("document", window.document);
  setGlobalValue("navigator", window.navigator);
  setGlobalValue("Node", window.Node);
  setGlobalValue("Element", window.Element);
  setGlobalValue("HTMLElement", window.HTMLElement);
  setGlobalValue("SVGElement", window.SVGElement);
  setGlobalValue("DOMParser", window.DOMParser);
  setGlobalValue("XMLSerializer", window.XMLSerializer);
  setGlobalValue("getComputedStyle", window.getComputedStyle.bind(window));
  setGlobalValue("MutationObserver", window.MutationObserver);
  setGlobalValue("requestAnimationFrame", (callback) => setTimeout(() => callback(Date.now()), 0));
  setGlobalValue("cancelAnimationFrame", (handle) => clearTimeout(handle));
  domReady = true;
}

async function getMermaidParser() {
  ensureBrowserLikeDom();
  mermaidParserPromise ??= import("mermaid/dist/mermaid.esm.min.mjs").then((module) => module.default);
  return mermaidParserPromise;
}

function walkMarkdownFiles(entryPath, ignoredDirectories) {
  const entries = readdirSync(entryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirectories.includes(entry.name)) continue;
    const nextPath = resolve(entryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(nextPath, ignoredDirectories));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(nextPath);
  }

  return files;
}

function listMarkdownFiles(root, ignoredDirectories) {
  const files = [];
  for (const entry of MARKDOWN_ROOTS) {
    const absPath = resolve(root, entry);
    if (entry.endsWith(".md")) files.push(absPath);
    else files.push(...walkMarkdownFiles(absPath, ignoredDirectories));
  }
  return files.sort();
}

function extractMermaidBlocks(file, content) {
  const lines = content.split(/\r?\n/);
  const blocks = [];
  const messages = [];
  let currentStartLine = null;
  let currentLines = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (currentStartLine === null) {
      if (/^```mermaid(?:\s+.*)?\s*$/.test(line)) {
        currentStartLine = index + 1;
        currentLines = [];
      }
      continue;
    }

    if (/^```\s*$/.test(line)) {
      blocks.push({ file, startLine: currentStartLine, content: currentLines.join("\n") });
      currentStartLine = null;
      currentLines = [];
      continue;
    }

    currentLines.push(line);
  }

  if (currentStartLine !== null) {
    messages.push(`[mermaid] FAIL: ${file}:${currentStartLine} has an unclosed mermaid code fence`);
  }

  return { blocks, messages };
}

async function checkMermaidSource(file, content) {
  const { blocks, messages } = extractMermaidBlocks(file, content);
  const mermaid = await getMermaidParser();

  for (const block of blocks) {
    try {
      await mermaid.parse(block.content);
    } catch (error) {
      const detail = error instanceof Error
        ? (error.message.split("\n").map((line) => line.trim()).filter(Boolean)[0] ?? error.message)
        : String(error);
      messages.push(`[mermaid] FAIL: ${block.file}:${block.startLine} invalid mermaid syntax (${detail})`);
    }
  }

  return { failures: messages.length, messages, checkedBlocks: blocks.length };
}

async function checkMermaid(root, ignoredDirectories) {
  const files = listMarkdownFiles(root, ignoredDirectories);
  const messages = [];
  let checkedBlocks = 0;

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const result = await checkMermaidSource(file, content);
    messages.push(...result.messages);
    checkedBlocks += result.checkedBlocks;
  }

  return { failures: messages.length, messages, checkedBlocks };
}

const root = resolve(import.meta.dirname, "..");
const ignoredDirectories = process.env.MERMAID_CHECK_IGNORE_DIRS?.split(",").filter(Boolean) ?? [];
const result = await checkMermaid(root, ignoredDirectories);

for (const msg of result.messages) console.error(msg);

if (result.failures > 0) {
  console.error(`\n[mermaid] ${result.failures} violation(s) found while checking ${result.checkedBlocks} mermaid block(s).`);
  process.exit(1);
}

console.log(`[mermaid] All ${result.checkedBlocks} mermaid block(s) passed.`);

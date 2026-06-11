import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const docsRoot = path.join(repoRoot, "docs");
const args = new Set(process.argv.slice(2));
const stagedOnly = args.has("--staged");
const shouldStage = args.has("--stage");

main();

function main() {
  if (!stagedOnly) {
    console.error("This script only supports --staged mode.");
    process.exit(1);
  }

  const candidates = stagedOnly ? getStagedAddedPaths() : getDocsPathsFromDisk();
  const groupedTargets = buildTargetsByPagesFile(candidates);
  const changedPagesFiles = [];

  for (const [pagesFile, targets] of groupedTargets.entries()) {
    const changed = syncPagesFile(pagesFile, targets);
    if (changed) {
      changedPagesFiles.push(pagesFile);
    }
  }

  if (shouldStage && changedPagesFiles.length > 0) {
    stageFiles(changedPagesFiles);
  }

  for (const file of changedPagesFiles) {
    console.log(path.relative(repoRoot, file));
  }
}

function getStagedAddedPaths() {
  const output = execGit([
    "diff",
    "--cached",
    "--name-status",
    "--diff-filter=A",
    "--",
    "docs",
  ]);

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      return parts.at(-1);
    })
    .filter((file) => isIndexableDocPath(file));
}

function buildTargetsByPagesFile(paths) {
  const grouped = new Map();

  for (const relativePath of paths) {
    const absolutePath = path.join(repoRoot, relativePath);
    const parentDir = path.dirname(absolutePath);
    const pagesFile = path.join(parentDir, ".pages");

    if (!fs.existsSync(pagesFile)) {
      continue;
    }

    pushTarget(grouped, pagesFile, path.basename(absolutePath));

    const relativeDir = path.relative(docsRoot, parentDir);
    if (!relativeDir || relativeDir.startsWith("..")) {
      continue;
    }

    const parentOfParent = path.dirname(parentDir);
    const parentPages = path.join(parentOfParent, ".pages");
    if (fs.existsSync(parentPages)) {
      pushTarget(grouped, parentPages, path.basename(parentDir));
    }
  }

  return grouped;
}

function pushTarget(grouped, pagesFile, target) {
  if (!grouped.has(pagesFile)) {
    grouped.set(pagesFile, new Set());
  }

  grouped.get(pagesFile).add(target);
}

function syncPagesFile(pagesFile, targets) {
  const original = fs.readFileSync(pagesFile, "utf8");
  const lines = original.split(/\r?\n/);
  const navInfo = parseNav(lines);
  const existingTargets = new Set(navInfo.entries.map((entry) => entry.target));
  const desiredTargets = navInfo.hasNav
    ? [...navInfo.entries.map((entry) => entry.target)]
    : listExistingIndexableEntries(path.dirname(pagesFile));

  let changed = false;

  for (const target of [...targets].sort(compareEntries)) {
    if (existingTargets.has(target)) {
      continue;
    }
    existingTargets.add(target);
    desiredTargets.push(target);
    changed = true;
  }

  if (!changed) {
    return false;
  }

  const uniqueTargets = [];
  const seen = new Set();
  for (const target of desiredTargets) {
    if (seen.has(target)) {
      continue;
    }
    seen.add(target);
    uniqueTargets.push(target);
  }

  const renderedNavLines = ["nav:", ...uniqueTargets.map((target) => `  - ${target}`)];
  let nextLines;

  if (navInfo.hasNav) {
    nextLines = [
      ...lines.slice(0, navInfo.start),
      ...renderedNavLines,
      ...lines.slice(navInfo.end),
    ];
  } else {
    nextLines = [...trimTrailingEmpty(lines), ...renderedNavLines];
  }

  const nextContent = `${nextLines.join("\n").replace(/\n+$/u, "")}\n`;
  if (nextContent === original) {
    return false;
  }

  fs.writeFileSync(pagesFile, nextContent);
  return true;
}

function parseNav(lines) {
  const start = lines.findIndex((line) => line.trim() === "nav:");
  if (start === -1) {
    return { hasNav: false, start: -1, end: -1, entries: [] };
  }

  const entries = [];
  let end = start + 1;

  while (end < lines.length) {
    const line = lines[end];
    if (!line.startsWith("  - ")) {
      break;
    }

    const raw = line.slice(4).trim();
    const target = raw.includes(":")
      ? raw.slice(raw.indexOf(":") + 1).trim()
      : raw;

    if (target) {
      entries.push({ raw, target });
    }

    end += 1;
  }

  return { hasNav: true, start, end, entries };
}

function listExistingIndexableEntries(dir) {
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => isIndexableEntry(entry))
    .map((entry) => entry.name)
    .sort(compareEntries);

  const index = entries.indexOf("index.md");
  if (index > 0) {
    entries.splice(index, 1);
    entries.unshift("index.md");
  }

  return entries;
}

function isIndexableEntry(entry) {
  if (entry.name.startsWith(".")) {
    return false;
  }

  if (entry.isDirectory()) {
    return true;
  }

  return isMarkdownFile(entry.name) && entry.name !== ".pages";
}

function isIndexableDocPath(file) {
  if (!file.startsWith("docs/")) {
    return false;
  }

  const base = path.basename(file);
  if (base.startsWith(".")) {
    return false;
  }

  return isMarkdownFile(base);
}

function isMarkdownFile(file) {
  return file.endsWith(".md");
}

function compareEntries(left, right) {
  if (left === "index.md") {
    return -1;
  }
  if (right === "index.md") {
    return 1;
  }
  return left.localeCompare(right, "zh-Hans-CN-u-kn-true");
}

function trimTrailingEmpty(lines) {
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === "") {
    end -= 1;
  }
  return lines.slice(0, end);
}

function stageFiles(files) {
  execGit(["add", "--", ...files.map((file) => path.relative(repoRoot, file))]);
}

function execGit(args) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
    }).trimEnd();
  } catch (error) {
    const fallback = spawnSync("rtk", ["git", ...args], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    if (fallback.status === 0) {
      return fallback.stdout.trimEnd();
    }

    throw error;
  }
}

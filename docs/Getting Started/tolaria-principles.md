---
type: Note
related_to: "[[tolaria]]"
onboarding: 1
---
# Principles

Tolaria is built on a few core principles that guide our design decisions:

### 📑 Files-first

Your notes are plain markdown files. They're portable, work with any editor, and require no export step. Your data belongs to you, not to any app.

### 🔌 Git-first

Every vault is a git repository. You get full version history, the ability to use any git remote, and zero dependency on Tolaria servers.

### 🛜 Offline-first, zero lock-in

No accounts, no subscriptions, no cloud dependencies. Your vault works completely offline and always will. If you stop using Tolaria, you lose nothing.

### 🔬 Open source

Tolaria is free and [open source](https://github.com/refactoringhq/tolaria). I built this for myself ([[luca-rossi]]) and for sharing it with others.

### 📋 Standards-based

Notes are markdown files with YAML frontmatter. No proprietary formats, no locked-in data. Everything works with standard tools if you decide to move away from Tolaria.

### 🔍 Types as lenses — not schemas

Types in Tolaria are navigation aids, not enforcement mechanisms. There's no required fields, no validation, just helpful categories for finding notes.

### 🪄AI-first — but not AI-only

A vault of files works very well with AI agents, but you are free to use whatever you want. We support Claude Code and Codex CLI (for now), but you can edit the vault with any AI you want. We provide an AGENTS file ([[agents]]) for your agents to figure out.

### ⌨️ Keyboard-first

Tolaria is designed for power-users who want to use keyboard as much as possible. A lot of how we designed [[tolaria-editor]] and [[command-palette]] is based on this.

### 💪 Built from real use

Tolaria was created for manage my personal vault of 10,000+ notes, and I use it every day. Every feature exists because it solved a real problem.

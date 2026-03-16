# guidebooks

A documentation site built with MkDocs Material theme.

## Overview

This project provides documentation using MkDocs, a fast and simple static site generator designed for building documentation sites. The site uses the Material for MkDocs theme with search functionality and code copy features.

## Quick Start

### Prerequisites

- Python 3.x
- uv (or pip)

### Installation

```bash
uv sync
```

### Development

```bash
uv run mkdocs serve
```

Then visit http://0.0.0.0:8000

### Build

```bash
uv run mkdocs build
```

## Project Structure

- `docs/` - Documentation source files
- `site/` - Generated static site (build output)
- `mkdocs.yml` - MkDocs configuration
- `pyproject.toml` - Python dependencies

## Configuration

The site is configured with:
- Material theme with dark/light mode toggle
- Search plugin
- Code copy functionality
- Mermaid diagram support

---

Last updated: March 16th, 2026 12:11:19

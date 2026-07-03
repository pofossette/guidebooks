---
type: Note
related_to: "[[tolaria]]"
onboarding: 5
---
# Properties Panel

The properties panel shows and edits a note's frontmatter in a user-friendly way.

### Type-Aware UI

Different property types render with appropriate controls:

- **Text and numbers** — simple input fields
- **Dates** — date picker for easy selection
- **Status** — dropdown with predefined options
- **Tags** — tag input with autocomplete

![CleanShot 2026-04-17 at 17.58.11@2x.png](attachments/1776441635173-CleanShot_2026-04-17_at_17.58.11_2x.png)

### Relationships

Wikilink values in frontmatter become clickable links to other notes. The panel shows relationships with a rich interface—click to navigate, see previews, and manage connections.

Tolaria also tracks backlinks and reverse relationships

![CleanShot 2026-04-17 at 18.01.19@2x.png](attachments/1776441716304-CleanShot_2026-04-17_at_18.01.19_2x.png)

### Default Relationships

Even if not in the frontmatter, you can add common relationships with one click. This is super opinionated and comes from my own experience. A lot of relationships between notes can simply be modelled as:

- ⬆️ **Belongs to** — Parent relationships
- ➡️ **Related to** — General connections
- ⬇️ **Has** — Child/possession relationships (inverse of belongs to)

These defaults help you quickly add structure without creating complex schemas and remembering property names that need to stay consistent across the vault.

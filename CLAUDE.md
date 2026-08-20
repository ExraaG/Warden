# Warden — AI Agent Guidelines (Claude Code)

Refer to [`PROJECT_RULES.md`](./PROJECT_RULES.md) for full architectural guidelines, strict UI rules, port specifications (`:22313`), mobile build instructions, and branch policies (`dev` vs `main`).

## Critical Rules for Claude
- **Port**: Warden web and API runs on port **`:22313`** (`http://localhost:22313`). Never assume `:3000`.
- **Git & Remotes Policy**:
  - `dev` branch is strictly **PRIVATE**. ONLY push `dev` to `private` (`https://github.com/ExraaG/Warden-Dev.git`).
  - NEVER push `dev` to public `origin` (`ExraaG/Warden`).
  - Production releases: run `./scripts/merge-dev-to-main.sh` and push `main` to `origin main`.
- **Strict UI Constraints**:
  - Strictly **NO emojis** anywhere in the UI, components, badges, buttons, tooltips, or logs. Use clean SVG icons (`WardenIcon`).
  - Always use `/warden_logo.png` for branding.
  - Strictly **NO CSS gradients**, glowing drop-shadows, or blurred colored backdrops. Use solid, clean dark palette colors (`#090d16`, `#0e1526`, `#1e293b`).
  - Strictly **NO pulsing or flashing animations**. Use **NO dots at all** on status pills, badges, or usernames.
  - Strictly **NO marketing fluff text**, decorative subtitles, or fake security badges.
  - Clean username badge in header (username only, no dots, no fake 2FA tags).
- **Branch Policy**:
  - Developer & Testing Lab tools (Global Server Purge, Global User Purge, Factory Wipe) are strictly on `dev`.
  - When merging to `main`, `./scripts/merge-dev-to-main.sh` automatically strips developer wipe tools.
  - "Delete All My Servers" (own servers only) with typed verification (`DELETE ALL MY SERVERS`) stays in `main`.
- **Mobile Build**:
  - Java 17 LTS required: `JAVA_HOME=/usr/lib/jvm/java-17-openjdk`.
- **Knowledge Graph**:
  - Run `graphify update .` after modifying code files.

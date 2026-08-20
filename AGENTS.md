# Warden Developer & Agent Guidelines

Refer to [`PROJECT_RULES.md`](./PROJECT_RULES.md) for full architectural guidelines, strict UI rules, port specifications (`:22313`), mobile build instructions, and branch policies (`dev` vs `main`).

## Quick Rule Summary
- **Port**: Warden runs on port **`:22313`**.
- **UI Constraints**:
  - No emojis anywhere in the UI.
  - Use `/warden_logo.png` for branding.
  - No CSS gradients, glowing drop-shadows, or pulsing/flashing animations.
  - No marketing fluff text or fake subtitles.
  - Clean username in header (no dots, no fake 2FA tags).
- **Branch Policy**:
  - Developer & Testing Lab tools are strictly on `dev`. Remove when merging into `main`.
  - "Delete All My Servers" (own servers only) with typed verification (`DELETE ALL MY SERVERS`) stays in `main`.
- **Mobile Build**:
  - Java 17 LTS required: `JAVA_HOME=/usr/lib/jvm/java-17-openjdk`.
- **Graphify**:
  - Run `graphify update .` after modifying code files.

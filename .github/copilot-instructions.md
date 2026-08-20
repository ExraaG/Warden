# GitHub Copilot Instructions for Warden

Refer to `PROJECT_RULES.md` for complete architecture and guidelines.

## Quick Rules
- **Port**: Warden runs on port `:22313`.
- **Git & Remotes**: `dev` branch is strictly PRIVATE. ONLY push `dev` to `private` (`https://github.com/ExraaG/Warden-Dev.git`). NEVER push `dev` to public `origin`.
- **UI Guidelines**:
  - No emojis anywhere in the UI. Use SVG icons (`WardenIcon`).
  - Use official `/warden_logo.png`.
  - No CSS gradients, glowing drop-shadows, or animations.
  - No dots on status pills, badges, or usernames (no dots at all).
  - No marketing fluff text.
  - Clean username in header (no dots, no fake 2FA tags).
- **Branch Policy**:
  - Developer & Testing Lab tools are strictly on `dev`.
  - Use `./scripts/merge-dev-to-main.sh` for production release merges.
- **Mobile**:
  - Java 17 LTS required: `JAVA_HOME=/usr/lib/jvm/java-17-openjdk`.

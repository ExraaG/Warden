# Warden — Project Blueprint, Architecture & AI Agent Rules

> **Note for AI Coding Assistants (Antigravity, Claude, Copilot, Cursor, etc.):**
> Read this document completely before modifying or generating code for the Warden project. It contains the architecture specifications, user-defined rules, strict UI constraints, branch policies, and development workflows.

---

## 1. Project Overview & Architecture

**Warden** is an enterprise-grade, self-hosted Minecraft server orchestration platform and mobile thin-client built for speed, safety, and seamless modpack management.

### Monorepo Structure
```
Warden/
├── server/               # Fullstack Next.js 14 App Router + Express REST & SSE API Backend
│   ├── src/
│   │   ├── app/          # Next.js frontend pages (Dashboard, Settings, Logs, Auth)
│   │   ├── core/         # Minecraft Server lifecycle, process management, mod detection
│   │   ├── db/           # File/JSON based storage and state management
│   │   ├── routes/       # Express API routes (Servers, Users, System, Mods, Jobs)
│   │   └── services/     # Modrinth API, automated backups, 4 AM cron jobs
├── mobile/               # React Native Android Mobile Thin-Client App
│   ├── src/
│   │   ├── components/   # UI components (Card, Button, Badge, Dropdown, Icons)
│   │   ├── context/      # AppContext (host connection, server selection, credentials)
│   │   ├── screens/      # Dashboard (Ops), Mods, Jobs (Audit), Settings, Onboarding
│   │   └── services/     # Warden REST API client
│   └── android/          # Android native project (Gradle 8.8, Java 17 LTS)
├── shared/               # Shared TypeScript schemas, types, and contracts (@warden/shared)
├── Dockerfile            # Multi-stage production container (Node 20 + Java 17/21/25 runtimes)
└── graphify-out/         # Knowledge graph index for architectural navigation
```

---

## 2. Global Port & Network Configuration

- **Default Web & API Port**: **`:22313`** (e.g. `http://localhost:22313` or `http://192.168.1.x:22313`).
- **NEVER assume port 3000** for dev servers, curl commands, or browser tests.

---

## 3. Strict UI Guidelines & Design Rules

### Visual Aesthetics
1. **Palette**: Clean, high-contrast dark theme (Obsidian slate `#090d16` / `#0e1526`, border `#1e293b`, emerald `#34d399`, cyan `#38bdf8`, danger red `#ef4444`, warning amber `#f59e0b`).
2. **No Emojis**: NEVER use emojis anywhere in the UI, components, badges, buttons, tooltips, or logs. Use clean SVG icons (`WardenIcon` / custom SVGs) instead.
3. **Official Logo**: Always use the official Warden logo from `docs/assets/warden_logo.png` (`/warden_logo.png`). Never place generic standalone icons inside decorative boxes with separate AI-style text titles underneath.
4. **No Gradients or Glow Effects**: Do not use decorative CSS gradients (e.g., `bg-gradient-to-...`, gradient text) or glowing drop-shadows. Use solid, clean, high-contrast dark palette colors and crisp borders.
   - *Exception*: The top "New Update Available" notification banner in `server/src/app/layout.tsx` retains its emerald-to-slate gradient and border accent.
5. **No Flashing, Pulsing, or Status Dots**: Do not add flashing, pulsing, or pinging animations (e.g., `animate-ping`, `animate-pulse`). Use **no dots at all** on status pills, badges, or usernames.
6. **No Fluff Text or Placeholder Subtitles**: Avoid filler text (e.g. "Create Master Administrator Account", "Authentication Required", "End-to-end Encrypted Session"). Keep forms, headers, and cards strictly functional, direct, clean, and normal.
7. **Clean Header Badges**: Account badge in the header must show username only. Do not attach colored status dots or useless tags (like `[2FA]`) next to usernames.
8. **Responsive Adaptiveness**: Ensure layouts adjust seamlessly across Desktop (1920x1080), Tablet (768x1024), and Mobile (390x844) viewports without text overlap or horizontal overflow.

---

## 4. Git Remotes & Branch Policies (`private/dev` vs `origin/main`)

### Git Remote Architecture:
- **`private` Remote (`https://github.com/ExraaG/Warden-Dev.git`)**:
  - Contains the active, private **`dev`** branch.
  - **CRITICAL**: ONLY push `dev` to `private dev`. **NEVER** push `dev` to public `origin`.
- **`origin` Remote (`https://github.com/ExraaG/Warden.git`)**:
  - The public production repository.
  - Contains ONLY the release-ready **`main`** branch.

### Feature Scope on `dev` Branch:
- **Developer & Testing Lab**:
  - Global Server Purge (`DELETE /api/v1/servers/batch/all?scope=all`) — admin only.
  - Global User Purge (`DELETE /api/v1/users/batch/all`) — with option to retain current admin.
  - Full System Factory Reset (`POST /api/v1/system/dev-reset`) — returns Warden to first-time setup.
  - Internal AI Agent Docs (`PROJECT_RULES.md`, `AGENTS.md`, `.agents/`).

### Release to `main` Workflow:
1. Run `./scripts/merge-dev-to-main.sh` which automatically:
   - Merges `dev` into `main`.
   - Strips the Developer & Testing Lab UI card and dev-reset endpoints from `main`.
   - Removes `PROJECT_RULES.md` & `AGENTS.md` and appends them to `.gitignore` on `main`.
   - Builds and verifies production Next.js bundle.
2. Push `main` to the public repository:
   ```bash
   git push origin main
   ```

---

## 5. Development & Build Workflows

### 1. Web & Server (`server/`)
```bash
cd server
npm run dev               # Runs Next.js + Express API on port 22313
npm run build             # Validates TypeScript and builds production bundle
```

### 2. Mobile Client (`mobile/`)
- **Android SDK Path**: `~/Android/Sdk`
- **Java Home**: Must use **Java 17 LTS** (`/usr/lib/jvm/java-17-openjdk`) because Gradle 8.8 fails on Java 26+.
```bash
# 1. Generate standalone offline React Native bundle
cd mobile
npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res/

# 2. Compile Android Debug APK
cd android
JAVA_HOME=/usr/lib/jvm/java-17-openjdk ./gradlew assembleDebug

# 3. Deploy to attached physical phone or emulator via ADB
adb -s <DEVICE_ID> install -r app/build/outputs/apk/debug/app-debug.apk
adb -s <DEVICE_ID> shell am start -n com.warden.app/.MainActivity
```

### 3. Docker Container
```bash
docker build -t warden:dev .
```

### 4. Knowledge Graph Synchronization
- Always keep the graphify knowledge graph updated after editing code files:
```bash
graphify update .
```

---

## 6. AI Agent Pair-Programming Directives

1. **Full Autonomous Execution**: The user grants full execution permissions. Do not ask for user permission to run standard non-destructive terminal commands, build scripts, tests, or inspection tools.
2. **Automated End-to-End Verification**:
   - For web changes: Test and capture screenshots using Puppeteer/Chrome or browser subagent on port `:22313`.
   - For mobile changes: Compile bundle, build APK, install to attached device via ADB, launch activity, and capture screenshot.
3. **Commit & Push Discipline**: When ready to push, verify `git status`, stage relevant files, commit with descriptive conventional commit messages, and push **ONLY** to `private dev`.



<p align="center">
  <img src="docs/assets/warden_logo.png" width="460" alt="Warden Logo" />
</p>

<p align="center">
  <b>Modern Standalone Minecraft Server Manager & Automation Engine</b><br />
  <i>Lightweight, self-hosted management web app with 1-click server creation, real-time console, Modrinth & .mrpack updates.</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/docker-ready-2496ED?style=flat&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/next.js-14-000000?style=flat&logo=next.js&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/typescript-5.x-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/modrinth-v2_api-00AF5C?style=flat&logo=modrinth&logoColor=white" alt="Modrinth" />
  <img src="https://img.shields.io/badge/Android%20Client-Coming%20Soon-3DDC84?style=flat&logo=android&logoColor=white" alt="Android Client Coming Soon" />
  <img src="https://img.shields.io/badge/license-GNUv3-blue.svg?style=flat" alt="GNUv3 License" />
</p>

<p align="center">
  <a href="https://ko-fi.com/exraa" target="_blank">
    <img src="https://storage.ko-fi.com/cdn/kofi5.png?v=3" height="42" alt="Buy Me A Coffee at ko-fi.com" />
  </a>
</p>






## Screenshots

**Dashboard — Server Overview with live stats and mods overview**

![Dashboard](docs/screenshots/dashboard.png)

**Audit Logs — Step-by-step 4 AM update execution trail**

![Audit Logs](docs/screenshots/audit-logs.png)

**Settings — Timezone, automated update schedules, and security management**

![Settings](docs/screenshots/settings.png)


## Key Features

- **100% Standalone & Self-Contained**: Zero external panels or dependencies required. Warden directly installs, executes, monitors, and automates Minecraft servers.
- **1-Click Server Installer**: Auto-downloads and initializes official server JARs directly from PaperMC, Fabric Meta, Purpur, Quilt, and Mojang APIs.
- **Flat Dark Ops-Tool Aesthetic**: Built with dark slate theme, Industrial Safety Amber (`#f59e0b`) accent, Tabler icons, crisp custom UI components, and **zero gradients**.
- **Real-Time Interactive Console**: Streaming console output with command suggestions and instant stdin command execution.
- **Modrinth v2 API Integration**:
  - Searches and installs mods with automatic loader (Fabric/Paper/Purpur/Quilt/Vanilla) and Minecraft version filtering.
  - Resolves required dependencies recursively before installing.
  - Verifies SHA-512 checksums of downloaded mod `.jar` files prior to deployment.
- **.mrpack Modpack Support**:
  - 1-click modpack upload, preview, and selective mod/datapack/override installation.
- **Safety Engine**:
  - Batch queries Modrinth via `POST /v2/version_files/update` using local SHA-512 hashes.
  - Pre-update safety backups of current server `mods` directory.
  - **Automatic Rollback**: If server fails to reach `online` status or crashes after updates, automatically restores pre-update backup and restarts the server safely.
- **Single Docker Container Deployment**:
  - Runs Express API + Next.js frontend + Java OpenJDK runtime in a single lightweight unit mounting `./data:/data`.
- **Android Companion App (Coming Soon)**:
  - Native React Native / Android client for remote server controls, real-time push alerts on crashes/updates, and live monitoring from anywhere.


## Repo Structure

```
Warden/
├── docker-compose.yml       # Production Compose configuration
├── .env.example             # Environment variable template
├── shared/                  # @warden/shared API types and contracts
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       └── types.ts
└── server/                  # Node.js/Express API + Next.js web application
    ├── Dockerfile           # Multi-stage container runner with OpenJDK
    ├── package.json
    ├── tsconfig.json
    ├── tsconfig.server.json
    └── src/
        ├── server.ts        # Express server entry point
        ├── config.ts        # Environment & config loader
        ├── core/
        │   ├── serverProcess.ts   # Java child process runner & stats
        │   ├── serverInstaller.ts # 1-click Paper/Fabric/Purpur/Vanilla installer
        │   └── serverManager.ts   # Master orchestrator & filesystem manager
        ├── adapters/
        │   ├── modrinth.ts  # Modrinth v2 client & dependency resolver
        │   └── mrpack.ts    # .mrpack parser & extractor
        ├── db/
        │   └── storage.ts   # Persistent JSON storage in /data
        ├── jobs/
        │   └── cron.ts      # 4 AM safety update cron runner
        ├── routes/
        │   └── api.ts       # Express REST API routes (/api/v1/*)
        ├── components/ui/   # Custom flat component layer
        └── app/             # Next.js web views (Dashboard, Mods, Audit Logs, Settings)
```


## Quick Start (Docker Deployment)

### 1. Clone Repository & Start

```bash
# Clone the repository
git clone https://github.com/ExraaG/Warden.git
cd Warden

# Start Warden in the background
docker compose up -d --build
```

- Access the Warden dashboard at `http://localhost:22313` (or `http://<YOUR-SERVER-IP>:22313`)
- Connect your Minecraft client to port `25565`
- View live application logs: `docker compose logs -f`
- Stop the container: `docker compose down`


## Operational Tasks

### Creating a Server
1. Click **+ New Server** in the top header.
2. Select your desired server software (Paper, Fabric, Purpur, Quilt, Vanilla) and Minecraft version (e.g. `1.21.1`).
3. Set your allocated memory (e.g. `4G`) and port (`25565`), then click **Install & Create Server**.

### Monitoring & Triggering Update Jobs
- **Scheduled 4 AM Job**: Runs automatically at 4:00 AM in your configured `TZ` timezone.
- **Manual Trigger**: Click **Run Mod Updates** on the Dashboard or send `POST /api/v1/servers/:id/update-now`.
- **View Step Execution & Rollback History**: Navigate to the **Audit Logs** tab to view step-by-step execution logs (`modrinth_hash_batch`, `download_verify`, `backup`, `stop_server`, `swap_files`, `verify_directory`, `start_server`, `rollback_action`).


## Disclaimer & Attribution

Portions of this codebase and architecture were built and accelerated with the assistance of AI development tools. All code has been structured, reviewed, and tested for performance, reliability, and security.

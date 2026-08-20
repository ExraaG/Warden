#!/usr/bin/env bash
set -e

echo "=== Warden: Merging 'dev' branch into 'main' ==="

# 1. Ensure git is clean
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: Working directory is not clean. Please commit or stash your changes first."
  exit 1
fi

CURRENT_BRANCH=$(git branch --show-current)

# 2. Checkout main & merge dev
echo "--> Checking out 'main'..."
git checkout main
git pull origin main || true

echo "--> Merging 'dev' into 'main'..."
git merge dev --no-edit

# 3. Strip dev-only tools from main
echo "--> Removing Developer & Testing Lab tools for production 'main'..."

# Node script to strip dev-only code blocks
node -e '
const fs = require("fs");

// 1. Clean server/src/app/settings/page.tsx (remove Developer & Testing Lab section)
const settingsPath = "server/src/app/settings/page.tsx";
if (fs.existsSync(settingsPath)) {
  let content = fs.readFileSync(settingsPath, "utf-8");
  
  // Remove dev state hooks & handlers if marked
  content = content.replace(/\/\* DEV_LAB_START \*\/[\s\S]*?\/\* DEV_LAB_END \*\//g, "");
  
  // Remove DEV_LAB_CARD
  content = content.replace(/\{DEV_LAB_SECTION\}[\s\S]*?\{\/DEV_LAB_SECTION\}/g, "");
  
  // Remove the Developer & Testing Lab card block cleanly
  const cardStart = content.indexOf("Developer & Testing Lab");
  if (cardStart !== -1) {
    const sectionStart = content.lastIndexOf("<div className=\"p-6 rounded-xl border border-rose-900", cardStart);
    if (sectionStart !== -1) {
      const sectionEnd = content.indexOf("</div>\n          )}", sectionStart);
      if (sectionEnd !== -1) {
        content = content.substring(0, sectionStart) + content.substring(sectionEnd + 6);
      }
    }
  }
  
  fs.writeFileSync(settingsPath, content, "utf-8");
  console.log("    ✓ Stripped Developer & Testing Lab card from settings/page.tsx");
}

// 2. Clean server/src/routes/api.ts (remove dev-reset and admin global batch wipes)
const apiPath = "server/src/routes/api.ts";
if (fs.existsSync(apiPath)) {
  let apiContent = fs.readFileSync(apiPath, "utf-8");
  
  // Replace /system/dev-reset with 403 Forbidden in main
  apiContent = apiContent.replace(
    /router\.post\(\x27\/system\/dev-reset\x27,[\s\S]*?\n\}\);/,
    "router.post(\x27/system/dev-reset\x27, (req, res) => res.status(403).json({ error: \x27Developer Reset is disabled in production main branch\x27 }));"
  );
  
  fs.writeFileSync(apiPath, apiContent, "utf-8");
  console.log("    ✓ Disabled /system/dev-reset endpoint in routes/api.ts");
}
'

# 4. Remove internal agent rule files from main and add to .gitignore on main
echo "--> Removing internal agent rules from git tracking on 'main'..."
git rm -f --ignore-unmatch PROJECT_RULES.md AGENTS.md CLAUDE.md GEMINI.md .cursorrules .github/copilot-instructions.md

# Ensure .gitignore on main ignores internal AI docs
if ! grep -q "PROJECT_RULES.md" .gitignore; then
  echo -e "\n# Internal AI & Agent docs (dev only)\nPROJECT_RULES.md\nAGENTS.md\nCLAUDE.md\nGEMINI.md\n.cursorrules\n.github/copilot-instructions.md" >> .gitignore
fi

# 5. Validate build
echo "--> Verifying server build on 'main'..."
cd server
npm run build
cd ..

# 6. Commit cleaned main branch
git add server/src/app/settings/page.tsx server/src/routes/api.ts .gitignore
if [ -n "$(git status --porcelain)" ]; then
  git commit -m "chore(main): strip dev tools and internal agent docs from production release"
fi

echo "=== Merge to 'main' completed successfully! ==="
echo "Run: 'git push origin main' when you are ready to publish to production."
echo "To switch back to dev: 'git checkout dev'"

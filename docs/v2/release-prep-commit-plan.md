# Recommended release commit boundaries (T-V2-LAUNCH-RELEASE-PREP-01)
#
# Do not run until: data refresh is complete (or explicitly waived),
# tests/smoke pass, and a human asks Cursor/local git to commit.
# Do not push without separate human approval.
#
# STATUS AT PREP TIME: NOT READY — DATA REFRESH REQUIRED
# (AMC_API_KEY unset locally; do not fabricate timestamps.)
#
# Exclude always:
#   tmp-v2-qc/  dist-v2/  node_modules/  .env*  .venv/
#   scripts/_tmp_*  supabase/ (unless intentionally shipping)
#   Cursor canvases under ~/.cursor/
#
# Unrelated / leave unstaged unless you intend a broader release:
#   Canonical Mockup Images/**
#   cockpit/**
#   data/film_identity/** data/audits/** (matcher-only churn)
#   reel_seattle/film_identity/** (except if build requires)
#   Most scripts/capture_*_qc.mjs (local QC only)
#   docs/v2/reel-seattle-stage-1-final-acceptance-audit-cursor-prompt.md

## Commit 1 — Prepare Reel Seattle v2 launch candidate

git add \
  .gitignore \
  package.json package-lock.json \
  vite.v2.config.js \
  v2/ \
  tests/frontend/v2*.test.mjs \
  tests/frontend/plannerEngine.test.mjs \
  tests/frontend/calendarExport.test.mjs \
  tests/fixtures/frontend/v2_showtimes_home_mini.json \
  tests/fixtures/frontend/v2_theaters_home_mini.json \
  src/utils/plannerEngine.js \
  src/utils/calendarExport.js \
  scripts/smoke_check_v2.mjs \
  scripts/smoke_check_v2_static.mjs \
  scripts/check_dist_v2_artifacts.mjs \
  scripts/planner_launch_static_qa.mjs \
  scripts/launch_gate_reaudit_01.mjs \
  public/theater-images/ \
  public/data/film_enrichment_current.json \
  public/data/theaters.json \
  docs/v2/pages-deploy-rollback.md \
  docs/v2/README.md

# Review carefully — add only launch-needed supporting modules already imported by v2:
#   v2/auth v2/enrichment v2/calendar (required by V2App imports)

git status
git commit -m "$(cat <<'EOF'
Prepare Reel Seattle v2 launch candidate.

Ship showtimes browse, planner hardening, static data packaging, and schedule acceptance copy so dist-v2 is production-ready once Pages and fresh data land.
EOF
)"

## Commit 2 — Deploy Reel Seattle v2 on GitHub Pages

git add .github/workflows/deploy.yml docs/v2/pages-deploy-rollback.md
git commit -m "$(cat <<'EOF'
Deploy Reel Seattle v2 on GitHub Pages.

Switch Pages from legacy dist to dist-v2 with artifact checks, static smoke, and www.reelseattle.com CNAME preservation; keep npm run build for rollback.
EOF
)"

## Commit 3 — Refresh data (after workflow / local scrape)

# Only after a real refresh updates these files:
git add \
  public/data/showtimes_current.json \
  public/data/pipeline_report.json \
  public/data/newly_added_current.json \
  public/data/theaters.json \
  data/theaters.json \
  data/history/showtimes_history.csv

git commit -m "$(cat <<'EOF'
Refresh Reel Seattle showtime data.

Commit the current pipeline emit so Pages and dist-v2 package a fresh forward window.
EOF
)"

## Data refresh (human / Actions — preferred)

# Uses repo secret AMC_API_KEY; pushes a data commit to main (triggers deploy).
# Prefer running AFTER Commit 2 is on main so the deploy builds v2 with fresh data.
gh workflow run "Daily Showtime Scraping"

# Or locally (requires AMC_API_KEY in the environment, not committed):
#   python -m venv .venv
#   .venv\Scripts\activate   # Windows
#   pip install -r requirements.txt
#   python run_daily_scraping.py
#   python scripts/validate_public_data_artifacts.py

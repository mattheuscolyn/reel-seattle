# v2 Pages deploy and rollback

Reel Seattle v2 ships from `dist-v2` via `.github/workflows/deploy.yml`.

## Production deploy (current)

1. `npm ci`
2. `npm run build:v2`
3. `node scripts/check_dist_v2_artifacts.mjs`
4. `SKIP_V2_BUILD=1 npm run smoke:v2:static`
5. Publish `./dist-v2` to `gh-pages` (peaceiris), with `cname: www.reelseattle.com`

Custom domain: GitHub Pages repo setting + `CNAME` written into `dist-v2` at build time and again by the deploy action `cname` input.

## Rollback to legacy site

Restore the previous Pages build in one commit:

```bash
git revert <deploy-v2-workflow-commit-sha>
git push origin main
```

Or manually edit `.github/workflows/deploy.yml` back to:

- `run: npm run build`
- `node scripts/check_dist_artifacts.mjs`
- `publish_dir: ./dist`

Do **not** remove `npm run build` / `vite.config.js` — they remain the legacy rollback path.

### Compatibility notes

- v2 localStorage keys use the `reel-seattle.v2.*` prefix and do not migrate or wipe legacy keys.
- Publishing v2 does not rewrite showtime schemas for the legacy app; both read `public/data` sources.
- No irreversible account/cloud migration is performed.

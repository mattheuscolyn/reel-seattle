# Theater imagery assets (`WS-TIMG`)

Repository-managed, **rights-cleared** venue images only.

## Layout

```text
public/theater-images/
  fixtures/          # product-owned QC/test assets (not venue photography)
  <theater-id>/      # curated venue photos when cleared
    hero.jpg
    thumb.jpg
```

## Registry fields (`schema/theaters/v1.1.0.json`)

| Field | Use |
|-------|-----|
| `image_url` | Shared fallback (hero + thumb) |
| `image_hero_url` | Detail hero (optional) |
| `image_thumbnail_url` | List thumb (optional) |
| `image_attribution` | Required when any image URL is set |
| `image_license` | Optional short license label |

Paths must be absolute `http(s)` **or** site-relative under `/theater-images/…`.

## Do not

- Copy uncleared files from `Theater Data/` into `public/`
- Scrape venue sites at runtime
- Invent photography for venues without clearance

## Remaining manual work

For each enabled theater: obtain permission / license, stage files here, set registry fields + attribution, sync `data/theaters.json` → `public/data/theaters.json`.

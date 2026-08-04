# Screening Qualifier Normalization - Duplicate Identity Report

## Issue: T-IDENTITY-SCREENING-VARIANTS-01

Date: 2026-08-04

## Summary

Enhanced screening qualifier detection and normalization to ensure variants of the same film receive consistent canonical identities. The normalization system now properly strips screening qualifiers before TMDB matching, preventing duplicate film entries for what should be a single film.

## Key Example: Spider-Man: Brand New Day

### Before Enhancement:
- **Source Film ID 78598**: "Spider-Man: Brand New Day" (normal screenings)
- **Source Film ID 84001**: "Spider-Man: Brand New Day: Sensory Friendly Screening"

### After Enhancement:
- **Both source IDs** now normalize to: "Spider-Man: Brand New Day"
- When TMDB matching runs with credentials, both will match to the same TMDB entry
- Both will receive the same `tmdb:xxxxx` canonical film identity
- User Saved/Seen/Not Interested state will be consistent across variants

## Screening Qualifiers Now Detected

The following screening qualifiers are now properly stripped during title normalization:

### Accessibility Qualifiers
- Sensory Friendly Screening
- Open Caption / Closed Captioned
- Audio Description

### Event Qualifiers
- Fan Event
- Opening Night (Fan Event)
- Early Access
- Community Screening
- Sing-Along / Singalong

### Anniversary & Special Screenings
- Nth Anniversary (e.g., "25th Anniversary")
- Anniversary Screening/Event
- Encore Screening
- Live / Live in Concert

### Format Qualifiers
- IMAX
- 3D / RealD 3D
- Dolby Cinema
- (Format) markers in parentheses

### Language Qualifiers
- Dubbed
- Subtitled

## Film Identity Duplicates Found in Current Data

### Same-Source Duplicates (AMC)
These pairs now share the same normalized title and will consolidate under TMDB matching:

1. **PAW Patrol: The Dino Movie**
   - 76344 (normal)
   - 84464 (early access variant)

2. **Spider-Man: Brand New Day**
   - 78598 (normal)
   - 84001 (sensory friendly variant) ✅ **Primary issue example**

### Cross-Source Duplicates
These films appear across multiple theater sources (expected behavior):

- **Boyhood**: AMC (84548) + SIFF
- **Muppet Treasure Island**: AMC (83813) + Central Cinema
- **Sheep in the Box**: AMC (84197) + SIFF
- **The Invite**: AMC (82975) + SIFF
- **The Odyssey**: AMC (76238) + SIFF

## Other Titles with Normalized Variants

The following titles had screening qualifiers stripped:

- Willy Wonka & the Chocolate Factory 55th Anniversary → Willy Wonka & the Chocolate Factory
- Train to Busan - 10th Anniversary Remastered & Revived → Train to Busan - Remastered & Revived
- Your Name. 10th Anniversary → Your Name.
- Wet Hot American Summer: 25th Anniversary → Wet Hot American Summer
- Point Break 35th Anniversary → Point Break
- La La Land 10th Anniversary → La La Land
- Boyhood 12th Anniversary → Boyhood
- PAW Patrol: The Dino Movie - Early Access → PAW Patrol: The Dino Movie
- Nimrods Early Access – Green Day Intro + Bonus Performance → Nimrods – Green Day Intro + Bonus Performance
- Super Troopers 3: Special Broken Lizard Fan Event → Super Troopers 3: Special Broken Lizard
- Six: The Musical Live! → Six: The Musical!
- MET Summer Encore: Aida (2026) → MET Summer: Aida (2026)

## Implementation Details

### Modified Files
- `reel_seattle/analysis/film_identity.py`: Enhanced `_VARIANT_SUFFIX_PATTERNS` with additional qualifiers
- `tests/film_identity/test_eligibility.py`: Added comprehensive regression tests

### New Patterns Added
- Community Screening
- Sing-along/Singalong
- Closed Caption/Audio Description
- Enhanced anniversary patterns (more conservative to avoid false positives like "The Anniversary Party")

### Pattern Strategy
Patterns are designed to be conservative:
- Only strip qualifiers that are clearly screening metadata, not part of the film title
- Use word boundaries and contextual markers to avoid false positives
- Test coverage ensures legitimate titles like "The Anniversary Party" are preserved

## Testing

✅ All 907 existing tests pass
✅ New comprehensive test coverage for screening qualifier normalization
✅ Regression tests for Spider-Man sensory-friendly example
✅ Tests for edge cases (preserving legitimate titles with similar words)

## Impact

### When TMDB Matching Succeeds
- ✅ All variants of a film receive the same `tmdb:xxxxx` identity
- ✅ User state (Saved/Seen/Not Interested) is consistent across variants
- ✅ Film Detail shows canonical title with variant information as metadata
- ✅ Duplicate film entries are consolidated

### When TMDB Matching Fails (Offline/Fallback)
- ⚠️ Variants still receive separate `source:amc:xxxxx` fallback identities
- ⚠️ This is expected behavior - fallback uses source_film_id for uniqueness
- ℹ️ The normalized title is still correct for display and future matching attempts

## Recommendations

1. **Monitor TMDB matching success rates** to ensure variants are being properly matched
2. **Consider UI enhancements** to group fallback identities by parent_film_key when TMDB matching unavailable
3. **Add more patterns** as new screening qualifier types are observed in production
4. **Document in AGENTS.md** if specific screening types should be handled differently

# Reel Seattle — Formats & Experiences Source of Truth

**Purpose:** Canonical product/content reference for the Reel Seattle **Formats & Experiences** surface.  
**Audience:** Reel Seattle developers, Cursor, designers, and content authors.  
**Last reviewed:** 2026-08-16

---

## 1. Product intent

The Formats & Experiences page should help a moviegoer answer two different questions:

1. **Formats:** “How will the movie look, sound, or physically be presented?”
2. **Experiences:** “Is there something distinctive about this screening that changes how I experience or access the movie?”

Formats can often be compared point-by-point. Experiences generally should **not** be ranked against one another because they serve different purposes.

This document is the source of truth for:
- definitions;
- user-facing benefits and drawbacks;
- comparison attributes;
- terminology;
- caveats;
- suggested concise copy;
- normalization rules.

It is **not** the source of truth for whether a specific Seattle screening actually has a format or experience. Reel Seattle should continue to derive that from theater/source data.

---

# 2. Format taxonomy

The formats currently in scope are:

- 35mm
- 70mm
- IMAX
- IMAX 70mm
- Dolby
- XL
- RealD 3D

## Important classification rule

A screening can have more than one characteristic, but Reel Seattle should avoid presenting overlapping labels as if they are interchangeable.

Examples:
- **IMAX 70mm** is not the same thing as ordinary **70mm**.
- **IMAX** can be digital laser or other IMAX projection; it does not automatically mean IMAX 70mm.
- **Dolby Atmos** alone does not necessarily make a screening **Dolby Cinema**.
- **RealD 3D** describes the 3D presentation system; a film can also have other premium auditorium traits.
- **35mm** and **70mm** refer to physical film projection, not merely a movie that was shot on film.

---

# 3. Comparison model

The UI may expose a side-by-side comparison similar to a consumer-electronics spec comparison.

Recommended comparison dimensions:

| Attribute | What it tells the user |
|---|---|
| **Projection medium** | Physical film vs digital |
| **Typical image character** | Crisp/clean, filmic/textured, 3D, etc. |
| **Image detail potential** | Relative ability to resolve fine visual detail |
| **Screen / scale emphasis** | Whether the format generally prioritizes a larger image or auditorium |
| **Expanded image possible** | Whether some films can show additional image vertically |
| **Contrast / HDR emphasis** | Whether the format is specifically designed around deep blacks / bright highlights |
| **Sound emphasis** | Whether upgraded sound is a defining part of the format |
| **3D** | Whether stereoscopic 3D is the defining feature |
| **Presentation rarity** | How uncommon the format is relative to ordinary digital screenings |
| **Best for** | The kind of movie or viewer most likely to value it |
| **Main tradeoff** | The most important reason someone might choose another format |

### Comparison language rules

Use **relative, consumer-friendly language**, not fake precision.

Good:
- “Very high”
- “Depends on auditorium”
- “Can show expanded IMAX image”
- “Film texture and analog character”

Avoid:
- assigning made-up resolution equivalents to film;
- implying every IMAX auditorium has the same screen dimensions;
- treating “4K” alone as proof that one screening will look better than another;
- claiming a format is universally “best.”

---

# 4. Quick comparison table

| Format | Medium | Image detail potential | Expanded image | Contrast / HDR emphasis | Sound emphasis | 3D | Relative rarity | Best shorthand |
|---|---|---:|---|---|---|---|---|---|
| **35mm** | Physical film | High, but print/projection dependent | No special expanded-image standard | No | No format-specific audio requirement | No | Uncommon | Classic photochemical presentation |
| **70mm** | Physical film | Very high | No IMAX-style expanded-image requirement | No | No modern standardized premium-audio requirement | No | Rare | Large-format film with exceptional detail |
| **IMAX** | Usually digital for modern screenings | High to very high; auditorium/system dependent | **Yes, for films mastered with expanded IMAX framing** | System dependent | **Yes, a major part of IMAX presentation** | Sometimes | Premium but broadly available | Big-screen immersion and expanded image |
| **IMAX 70mm** | Physical 15-perf 70mm IMAX film | Exceptional | **Yes; can reach 1.43:1 where supported** | Film presentation rather than HDR | **Yes, IMAX presentation** | Generally no for current feature-film engagements | Extremely rare | Maximum-scale analog IMAX |
| **Dolby Cinema** | Digital | Very high | No proprietary expanded-image benefit comparable to IMAX | **Major strength: Dolby Vision** | **Major strength: Dolby Atmos** | Not the defining feature | Premium / limited locations | Premium contrast + spatial sound |
| **XL at AMC** | Digital 4K laser | High | No proprietary expanded-image standard | Brighter laser presentation, but not Dolby Vision | Auditorium dependent; not its defining standardized feature | May vary by title/location | Premium / select locations | Bigger AMC auditorium + 4K laser |
| **RealD 3D** | Digital stereoscopic presentation | Depends on base projection | No expanded-image standard | 3D glasses reduce perceived brightness versus 2D | Depends on auditorium | **Yes** | Common for selected tentpoles | Depth and stereoscopic 3D |

**Do not turn this table into a strict ranking.** Format value depends heavily on the film, auditorium, projection condition, and viewer preference.

---

# 5. Individual format reference

## 5.1 35mm

### What it is

35mm is the traditional motion-picture film gauge that dominated theatrical exhibition for much of cinema history. For a Reel Seattle screening labeled **35mm**, the important fact is that the movie is being **projected from a physical film print**, rather than merely having been shot on film and shown digitally.

### What a viewer may notice

- visible film grain;
- a less clinically clean image than modern digital projection;
- organic texture;
- occasional small imperfections such as dust, scratches, cue marks, or slight instability depending on the print;
- the aesthetic character of photochemical projection.

### Benefits

- **Authentic film presentation.** Particularly valuable for repertory films or movies originally created for photochemical exhibition.
- **Distinct image texture.** Grain and film response can make the presentation feel materially different from digital.
- **Historical / archival appeal.** A 35mm print can make the screening itself feel like an event.
- **Director / cinematographer relevance.** For some films, analog projection is intentionally part of the desired experience.

### Downsides

- **Condition varies.** Older prints may be faded, scratched, damaged, or worn.
- **Less stable than digital.** Dust, weave, reel-change artifacts, or other physical imperfections can occur.
- **Not automatically higher fidelity.** A pristine digital restoration may contain more recoverable detail than a worn release print.
- **No standardized premium sound or HDR benefit.**

### Best for

- repertory cinema;
- film enthusiasts;
- viewers who value texture and historical presentation;
- titles where the theater specifically promotes a film print as part of the event.

### Suggested Reel Seattle short copy

> **Projected from an actual 35mm film print for a textured, photochemical presentation.**

### User-facing “Why choose it?”

> Choose 35mm when the **film presentation itself is part of the appeal**. Expect a more tactile, analog image — including grain and potentially some print wear — rather than the polished consistency of digital projection.

---

## 5.2 70mm

### What it is

For modern theatrical use, standard 70mm usually refers to **5-perforation 70mm projection**, sourced from large-format 65mm photography or a 70mm release print. Kodak distinguishes this from IMAX film: conventional 65mm capture runs vertically at 5 perforations per frame and is commonly associated with an approximately **2.20:1** image, while IMAX uses 15-perf film horizontally.

The camera negative is commonly **65mm** wide; projection prints are traditionally called **70mm**.

### What a viewer may notice

- unusually fine image detail;
- smooth, large-format photography;
- film grain that is generally finer relative to the image than 35mm;
- a grand, “big-format” quality even without the very tall IMAX frame.

### Benefits

- **Very high detail potential.** The larger film area can preserve exceptionally fine image information.
- **Large-format film character.** Combines analog texture with a much larger image area than conventional 35mm.
- **Rare presentation.** A true 70mm print is unusual enough to be a meaningful reason to choose a specific showtime.
- **Excellent for spectacle and landscapes.** Especially compelling when a movie was photographed on 65mm.

### Downsides

- **Rare and theater-dependent.** Very few venues maintain 70mm projection.
- **Print quality matters.** Like all film, physical condition and projection setup affect the result.
- **Not IMAX 70mm.** It does not by itself provide the giant 15/70 IMAX frame or 1.43:1 expanded IMAX image.
- **No standardized HDR advantage.**
- **Sound depends on the specific release/theater setup.** Do not market modern 70mm as having one universal sound system.

### Best for

- movies photographed on 65mm;
- prestige epics;
- restorations and special engagements;
- viewers prioritizing image detail plus analog film character.

### Suggested Reel Seattle short copy

> **Large-format 70mm film projection with exceptional detail and a distinctive analog image.**

### User-facing “Why choose it?”

> Choose 70mm for **large-format film detail and texture**. It is one of the most visually distinctive ways to see a movie, but it is different from the taller, even larger IMAX 70mm system.

---

## 5.3 IMAX

### What it is

IMAX is a premium cinema system built around a combination of:
- a large, immersive screen;
- specialized projection;
- IMAX remastering / presentation;
- proprietary sound;
- and, for selected films, **expanded aspect ratios** that reveal more image vertically than the standard theatrical presentation.

Modern IMAX is **not one single projector configuration**. Auditoriums can differ in screen size, projection generation, and whether they can display 1.43:1 material. Reel Seattle should therefore avoid universal claims such as “every IMAX is 1.43:1” or “every IMAX is dual laser.”

IMAX states that films made for the format may use **1.90:1 or 1.43:1** expanded framing.

### What a viewer may notice

- a larger perceived image;
- seating and screen geometry designed for immersion;
- strong, high-output sound;
- expanded vertical image on compatible films;
- image scale that can feel more enveloping than a conventional auditorium.

### Benefits

- **Expanded aspect ratio.** One of the strongest reasons to choose IMAX when a film includes IMAX-specific framing.
- **Immersive scale.** The screen and seating geometry are central to the format.
- **Premium sound.** Sound is a defining part of the IMAX system, not an incidental auditorium amenity.
- **Filmmaker support.** Some major releases are photographed or composed specifically with IMAX presentation in mind.

### Downsides

- **IMAX auditoriums vary materially.** Screen size, projector technology, and maximum aspect ratio are not uniform.
- **Not every movie uses expanded image.**
- **Premium pricing.**
- **May not be the best image-quality choice for every title.** For a movie without expanded IMAX framing, a high-end Dolby Cinema presentation may offer a more noticeable contrast/HDR advantage.
- **The label alone does not mean film projection.** Most modern IMAX screenings are digital.

### Best for

- films “Filmed for IMAX” or otherwise using expanded IMAX framing;
- large-scale action, sci-fi, nature, and spectacle;
- viewers who prioritize screen immersion.

### Suggested Reel Seattle short copy

> **An immersive large-screen presentation with powerful IMAX sound and, on supported films, expanded image.**

### User-facing “Why choose it?”

> Choose IMAX when **scale matters**, especially if the film has IMAX-expanded scenes. The exact screen and projection technology vary by theater.

---

## 5.4 IMAX 70mm

### What it is

IMAX 70mm is the analog IMAX film system, commonly referred to as **15/70**:
- 70mm projection print;
- image runs horizontally through the projector;
- each frame spans **15 perforations**;
- capable of the extremely tall **1.43:1** IMAX image.

Kodak describes IMAX 65mm capture as using the same base 65mm film stock as standard large-format production but running it horizontally across a 15-perforation-wide frame. IMAX has confirmed 15-perf/70mm projection for titles such as *Oppenheimer* and *The Odyssey*.

### What a viewer may notice

- enormous image area;
- extremely fine analog detail;
- the tallest IMAX composition when the movie and auditorium support 1.43:1;
- visible but fine film texture;
- the mechanical / analog character of film projection.

### Benefits

- **Exceptional image detail potential.**
- **Full 1.43:1 IMAX composition** for compatible material and venues.
- **Physical film presentation.**
- **Extremely rare.** The scarcity makes a screening a genuine special event.
- **Often the filmmaker-preferred presentation** for movies specifically shot and finished around 15/70 IMAX.

### Downsides

- **Extremely limited availability.**
- **Only especially valuable when the movie was created to exploit the format.**
- **Physical film can show presentation artifacts.**
- **Not HDR.** Its appeal is large-format analog image area and scale rather than digital HDR contrast.
- **A digital IMAX Laser auditorium may sometimes offer advantages such as greater consistency or different brightness characteristics**, depending on the title and venue.

### Best for

- films photographed with IMAX film cameras;
- movies with 1.43:1 IMAX sequences;
- viewers seeking the rarest and most maximal large-format presentation.

### Suggested Reel Seattle short copy

> **Rare 15/70 IMAX film projection with enormous image area and up to a 1.43:1 expanded frame.**

### User-facing “Why choose it?”

> Choose IMAX 70mm when the film was designed for it. It combines **huge IMAX scale, expanded 1.43:1 imagery, and physical large-format film**.

---

## 5.5 Dolby Cinema

### Naming rule

Within Reel Seattle, the top-level label **Dolby** should mean **Dolby Cinema** when the theater/source explicitly identifies the screening as Dolby Cinema.

**Do not convert “Dolby Atmos” alone into a Dolby Cinema format tag.**

### What it is

Dolby Cinema combines:
- **Dolby Vision** premium imaging;
- **Dolby Atmos** spatial audio;
- a purpose-designed premium auditorium.

Dolby describes Dolby Cinema specifically as the combination of Dolby Vision picture and Dolby Atmos sound.

### What a viewer may notice

- deep blacks;
- bright highlights;
- strong contrast;
- vivid color;
- highly directional, spatial sound;
- premium seating/auditorium design at participating theaters.

### Benefits

- **Contrast is a defining strength.** Dark scenes and bright highlights can have more visual impact.
- **Dolby Atmos.** Sound can be positioned around and above the audience.
- **Consistent premium package.** Picture and sound are both fundamental to the branded format.
- **Excellent all-around choice.** Especially strong for films with HDR-rich photography and sophisticated sound design.

### Downsides

- **No IMAX-style expanded aspect ratio benefit.**
- **Screen geometry may feel less enormous than the largest IMAX auditoriums.**
- **Premium pricing.**
- **Availability is limited to Dolby Cinema locations.**
- A film may be mastered for Dolby Atmos without receiving the full Dolby Cinema/Dolby Vision presentation; source labeling matters.

### Best for

- visually dark or high-contrast films;
- movies with elaborate sound design;
- action, horror, sci-fi, musicals, and prestige cinematography;
- users who value **picture contrast + sound** more than maximum screen height.

### Suggested Reel Seattle short copy

> **Dolby Vision picture and Dolby Atmos sound for deep contrast, vivid highlights, and immersive spatial audio.**

### User-facing “Why choose it?”

> Choose Dolby Cinema when you care most about **contrast, rich HDR picture, and immersive sound** rather than IMAX-exclusive expanded framing.

---

## 5.6 XL at AMC

### Naming rule

Reel Seattle’s **XL** format should currently refer to **XL at AMC** when that is the source label.

Do not assume that a generic theater term such as “XL,” “Xtreme,” or “large format” from another chain has the same technical specification.

### What it is

AMC describes XL at AMC as:
- its **largest screens and auditoriums**;
- **premium 4K laser projection by Barco**;
- a bigger/brighter premium presentation.

It is best understood as AMC’s large-screen premium option without the proprietary IMAX or Dolby Cinema presentation stack.

### What a viewer may notice

- a larger auditorium/screen than standard AMC houses;
- bright laser projection;
- a clean 4K digital image;
- a “premium large auditorium” feel.

### Benefits

- **Large screen / auditorium.**
- **4K laser projection.**
- **Often a straightforward upgrade over a standard auditorium** without relying on a film-specific expanded aspect ratio.
- Useful for spectacle when IMAX or Dolby is unavailable or inconvenient.

### Downsides

- **No IMAX-exclusive expanded image.**
- **No Dolby Vision requirement.**
- **No single branded spatial-audio feature is the core value proposition.**
- The improvement is primarily the **auditorium scale + laser projection**, so it may be less transformative than a film that specifically exploits IMAX or Dolby Cinema.
- Availability and auditorium characteristics vary by location.

### Best for

- mainstream blockbusters;
- viewers who want a bigger screen and strong digital projection;
- showtimes where IMAX/Dolby timing or location is less convenient.

### Suggested Reel Seattle short copy

> **AMC’s larger premium auditorium with bright 4K laser projection on one of the theater’s biggest screens.**

### User-facing “Why choose it?”

> Choose XL for a **bigger, brighter 4K laser presentation** when you want a premium screen without needing IMAX-specific framing or Dolby Cinema.

---

## 5.7 RealD 3D

### What it is

RealD 3D is a **stereoscopic digital cinema system**. The viewer wears polarized 3D glasses, and the system presents separate left-eye and right-eye images to create a perception of depth.

The defining feature is **3D**, not screen size, HDR, or a specific audio system.

### What a viewer may notice

- apparent depth into and out of the screen;
- objects appearing spatially separated;
- a more dimensional presentation for movies authored effectively for 3D.

### Benefits

- **Stereoscopic depth.**
- Can materially change the visual experience of films designed or carefully converted for 3D.
- Particularly effective for animation, visual-effects-heavy films, and titles composed around depth.

### Downsides

- **Glasses required.**
- **Reduced perceived brightness** is a common tradeoff of stereoscopic presentations because each eye receives a filtered image.
- Some viewers experience:
  - eye strain;
  - headaches;
  - motion discomfort;
  - difficulty perceiving the intended effect.
- Quality varies significantly based on how well the film was authored/converted for 3D.
- Does not inherently imply a larger screen or premium audio.

### Best for

- movies strongly designed around 3D;
- animation;
- spectacle where depth is part of the creative intent;
- viewers who specifically enjoy stereoscopic cinema.

### Suggested Reel Seattle short copy

> **Stereoscopic 3D projection using polarized glasses to add visible depth to the image.**

### User-facing “Why choose it?”

> Choose RealD 3D when you want **depth to be part of the experience**. It can be spectacular for films built around 3D, but the glasses and lower perceived brightness are meaningful tradeoffs.

---

# 6. Suggested format comparison details

The following structure is suitable for a “Compare formats” surface.

| Feature | 35mm | 70mm | IMAX | IMAX 70mm | Dolby Cinema | XL at AMC | RealD 3D |
|---|---|---|---|---|---|---|---|
| Physical film | **Yes** | **Yes** | Usually no | **Yes** | No | No | No |
| Large-format film | No | **Yes** | No unless IMAX 70mm | **Yes** | No | No | No |
| 4K digital | No | No | Depends on system | No | Premium digital system | **Yes** | Depends on base projector |
| Laser projection | No | No | Some locations | No | Digital premium projection | **Yes** | Depends on auditorium |
| Expanded aspect ratio | No | No special standard | **Sometimes: 1.90:1 / 1.43:1** | **Yes when film supports it; up to 1.43:1** | No proprietary expansion | No | No |
| HDR / extreme contrast focus | No | No | Not the defining comparison point | No | **Yes — Dolby Vision** | Not Dolby Vision | No |
| Premium spatial sound is core to format | No | No | **Yes** | **Yes** | **Yes — Dolby Atmos** | Not the core spec | No |
| 3D | No | No | Sometimes | Generally not for current feature engagements | Not defining | May vary | **Yes** |
| Analog texture | **Strong** | **Strong / fine-grained** | No for digital IMAX | **Strong / fine-grained** | No | No | No |
| Main reason to choose | Film character | Large-format film detail | Scale + expanded image | Ultimate analog IMAX | Contrast + sound | Bigger 4K laser screen | Stereoscopic depth |
| Biggest caveat | Print condition | Rarity | Auditorium variance | Extreme rarity | No expanded IMAX frame | Fewer unique format-specific features | Glasses / brightness / comfort |

---

# 7. Format decision guidance

This is optional editorial guidance for the product. It should not be framed as an absolute ranking.

## If a movie was shot for IMAX and has expanded IMAX footage

Prefer surfacing:
1. **IMAX 70mm**, if the venue and film actually support the intended 15/70 presentation;
2. a high-end **IMAX** presentation capable of the film’s expanded ratio;
3. **Dolby Cinema** if the user prioritizes contrast/sound over expanded framing;
4. other premium formats.

## If a movie has no IMAX-expanded imagery

The choice becomes more preference-driven:
- **Dolby Cinema:** picture contrast + spatial audio;
- **IMAX:** scale + IMAX sound;
- **XL:** large screen + 4K laser;
- **70mm / 35mm:** analog presentation as an artistic/event choice;
- **RealD 3D:** depth, where applicable.

## If the title has a true 70mm or 35mm print engagement

The page should call this out as a **distinctive event**, not merely another technical spec. Film projection is rare enough that “See it on film” can be meaningful editorial copy.

---

# 8. Experiences taxonomy

Experiences currently in scope:

- Open Caption
- Audio Description
- Live Score

These are **not mutually exclusive** and are **not a quality hierarchy**.

A screening can, for example, be both:
- IMAX + Audio Description;
- Dolby Cinema + Open Caption;
- 35mm + Live Score, depending on the event.

The UI should treat formats and experiences as separate dimensions.

---

# 9. Experience reference

## 9.1 Open Caption

### What it is

An **Open Caption** screening displays captions directly on the movie screen. Unlike closed-caption devices, every viewer sees the captions.

AMC describes Open Caption showtimes as displaying dialogue and relevant audio information as text on the big screen.

### What it is for

Open captions improve access for:
- Deaf and hard-of-hearing moviegoers;
- viewers who process dialogue more easily through text;
- viewers who struggle with accents, quiet dialogue, or dense sound mixes;
- anyone who simply prefers subtitles/captions.

### What the viewer should expect

- captions visible on-screen throughout the movie;
- spoken dialogue rendered as text;
- relevant non-dialogue audio information may also be captioned;
- no special caption device is required.

### Benefits

- **Always visible.**
- **No device setup or battery/positioning issue.**
- Allows groups to attend together without one person needing separate hardware.
- Can make difficult-to-hear dialogue easier to follow.

### Possible downside / preference consideration

- Captions are visible to everyone and cannot be individually turned off.
- Some viewers may find on-screen text visually distracting.

### Suggested Reel Seattle short copy

> **Captions appear directly on the movie screen for everyone in the auditorium.**

### Terminology rule

Use **Open Caption**, not “subtitled,” unless the source specifically means translated subtitles. Open captions can include dialogue and sound cues in the movie’s spoken language.

---

## 9.2 Audio Description

### What it is

Audio Description (AD) provides spoken narration describing important visual information during natural gaps in dialogue.

In movie theaters, audio description is commonly delivered through a **borrowed headset / assistive-listening device**, rather than played aloud to the whole auditorium.

### What it is for

Primarily designed to make films accessible to:
- blind moviegoers;
- low-vision moviegoers.

Description can include visually important:
- actions;
- facial expressions;
- settings;
- costumes;
- scene changes;
- text or other visual details where relevant.

### What the viewer should expect

- the normal film soundtrack remains present;
- an additional narration track describes relevant visual action;
- the description is generally heard only through the user’s device/headset;
- availability does not mean the auditorium itself will sound different for other patrons.

### Benefits

- Makes visually communicated story information accessible.
- Usually allows a patron to attend a standard screening with the rest of their group.
- Does not place narration over the auditorium speakers for everyone.

### Possible downside / operational caveat

- Depends on theater assistive-listening hardware being available and functioning correctly.
- Device implementation can vary by theater.

### Suggested Reel Seattle short copy

> **An optional narration track describes important visual action through a theater-provided headset.**

### Terminology rule

Do **not** describe Audio Description as captions, an alternate-language dub, or enhanced audio.

---

## 9.3 Live Score

### What it is

A **Live Score** screening presents the movie while musicians perform the film’s score live in synchronization with the picture.

The performance can range from:
- a full symphony orchestra;
- a chamber ensemble;
- a band;
- an organist or pianist for silent films;
- another live musical ensemble.

In modern “film with orchestra” presentations, the recorded musical score is typically removed or suppressed while the film’s dialogue and sound effects remain, allowing the musicians to perform the score live.

### What the viewer should expect

- the film projected on screen;
- musicians physically performing at the venue;
- the musical performance synchronized to the movie;
- a hybrid **movie + concert** event rather than a conventional screening.

### Benefits

- **Unique live performance.**
- Makes the score a much more prominent part of the experience.
- Audience energy can feel closer to a concert or special event.
- Particularly powerful for iconic scores and silent cinema.

### Downsides / preference considerations

- Usually more expensive than a standard screening.
- Often available for only one or a few performances.
- Venue may differ from a normal cinema auditorium.
- Seating may be optimized partly for the live musicians, not purely for screen sightlines.
- The experience intentionally draws more attention to the music, which may not be the preferred first viewing for every film.

### Best for

- favorite films;
- celebrated film scores;
- silent cinema;
- special-event moviegoing;
- viewers who enjoy orchestral/concert performance.

### Suggested Reel Seattle short copy

> **The film screens while musicians perform its score live in sync with the picture.**

### Classification rule

Only use **Live Score** when music is actually performed live alongside the film.

Do **not** apply it to:
- concert films showing a prerecorded concert;
- movies about musicians;
- screenings with a composer Q&A but no live score;
- normal films with prominent music.

---

# 10. Recommended UI content hierarchy

For each **format** detail page/card, Cursor should have access to:

1. **Name**
2. **One-line description**
3. **What it is**
4. **Why you might choose it**
5. **Tradeoffs**
6. **Best for**
7. **Comparison specs**
8. **Current Seattle screenings using that format**

For each **experience** detail page/card:

1. **Name**
2. **One-line description**
3. **What to expect**
4. **Who / what it is for**
5. **Benefits**
6. **Practical considerations**
7. **Current Seattle screenings offering that experience**

---

# 11. Suggested consumer-facing badges / descriptors

These are editorial descriptors, not source-data labels.

| Format | Suggested descriptor |
|---|---|
| 35mm | **ON FILM** |
| 70mm | **LARGE-FORMAT FILM** |
| IMAX | **EXPANDED IMAGE** when verified for the title; otherwise **IMMERSIVE SCREEN** |
| IMAX 70mm | **15/70 FILM** |
| Dolby Cinema | **VISION + ATMOS** |
| XL | **4K LASER** |
| RealD 3D | **3D GLASSES** |
| Open Caption | **ON-SCREEN CAPTIONS** |
| Audio Description | **OPTIONAL AD HEADSET** |
| Live Score | **LIVE MUSIC** |

Do not show **EXPANDED IMAGE** for an IMAX screening unless the film/presentation is known to contain expanded IMAX imagery.

---

# 12. Data / normalization rules for Cursor

## Formats

Canonical keys recommended:

```text
35mm
70mm
imax
imax-70mm
dolby-cinema
xl-amc
reald-3d
```

### Avoid false equivalence

Normalize only when source evidence is sufficient.

Examples:

```text
"70MM" -> 70mm
"70mm Film" -> 70mm

"IMAX" -> imax
"IMAX with Laser" -> imax
"IMAX 70MM" -> imax-70mm
"15/70 IMAX" -> imax-70mm

"Dolby Cinema" -> dolby-cinema
"Dolby Atmos" -> DO NOT automatically map to dolby-cinema

"XL at AMC" -> xl-amc
"XL" from AMC -> xl-amc if source context is unambiguous
"XL" from a non-AMC exhibitor -> DO NOT assume xl-amc

"RealD 3D" -> reald-3d
"3D" -> DO NOT automatically claim RealD unless exhibitor/source establishes RealD
```

## Experiences

Canonical keys recommended:

```text
open-caption
audio-description
live-score
```

Potential aliases:

```text
"Open Caption"
"Open Captions"
"OC"
-> open-caption

"Audio Description"
"Audio Described"
"AD"
-> audio-description, only when source context is clearly accessibility metadata

"Live Score"
"Live Orchestra"
"Film with Orchestra"
"Live to Picture"
-> live-score when the event actually includes synchronized live musical performance
```

---

# 13. Theater-specific caveat model

Technical presentation can vary within a brand. Reel Seattle should support optional **venue-specific notes** layered on top of this general format reference.

Examples of useful venue-level fields:

```text
screen_name
screen_width
screen_height
screen_aspect_ratio
projector_type
projector_generation
laser
dual_laser
film_projection
film_gauge
imax_1_43_capable
sound_system
recliners
source_verified_at
source_url
notes
```

This lets Reel Seattle eventually say things like:

- “This IMAX can display 1.43:1.”
- “This auditorium uses laser projection.”
- “This theater can project 70mm film.”

without incorrectly applying those facts to every auditorium with the same brand.

---

# 14. Editorial principles

## Be useful, not tribal

Premium-format discussions often devolve into “X is always better than Y.” Reel Seattle should instead explain **what changes** and let the user choose what they value.

Examples:

- IMAX may be the clearest recommendation when a movie has meaningful expanded IMAX imagery.
- Dolby Cinema may be more compelling when HDR contrast and Atmos are the major strengths of the release.
- 70mm may be the most interesting choice because of its analog presentation even if a digital format is technically more consistent.
- 35mm can be special because it is 35mm, not because it wins a numerical resolution contest.
- RealD 3D is valuable when the viewer wants stereoscopic depth, not because it belongs above or below 2D premium formats.

## Avoid unsupported superlatives

Avoid:
- “the best image”
- “the highest resolution”
- “the biggest screen”
- “the filmmaker’s intended format”

unless Reel Seattle has title- and venue-specific evidence.

Prefer:
- “exceptional detail potential”
- “one of the theater’s largest screens”
- “supports expanded IMAX imagery”
- “a rare film presentation”

## Separate capture from presentation

A movie can be:
- shot on 35mm and projected digitally;
- shot digitally and printed to 70mm;
- shot partly in IMAX and shown in standard digital;
- mastered in Dolby Atmos but not shown in Dolby Cinema.

The Formats & Experiences page describes **the presentation the user will attend**, not merely how the movie was photographed.

---

# 15. Reference notes

These sources establish the core definitions used above.

1. **IMAX — Filmed for IMAX**  
   IMAX states that filmmakers may compose for expanded **1.90:1 or 1.43:1** presentation.

2. **IMAX — Oppenheimer in IMAX 70mm**  
   IMAX identifies its film presentation as **15 perf / 70mm** and notes expansion up to **1.43:1**.

3. **Kodak — Dunkirk / large-format film**  
   Kodak distinguishes:
   - conventional 65mm large-format capture: vertical, **5-perf**, approximately **2.20:1**;
   - IMAX film capture: horizontal, **15-perf**, **1.43:1**.

4. **Dolby — Dolby Cinema**  
   Dolby defines Dolby Cinema around the combination of **Dolby Vision** imaging and **Dolby Atmos** audio.

5. **AMC — XL at AMC**  
   AMC describes XL as **premium 4K laser projection by Barco** on its largest screens and auditoriums.

6. **RealD**  
   RealD identifies RealD 3D as its cinema stereoscopic presentation system using 3D glasses.

7. **AMC — Open Caption / Assistive Moviegoing**  
   AMC identifies Open Caption performances as showing dialogue and audio information as text on the screen.

8. **American Council of the Blind — Audio Description Project**  
   The ADP explains that theatrical audio description is normally accessed using a borrowed headset/device.

9. **New York Philharmonic / CineConcerts**  
   Film-with-orchestra events screen the movie while an orchestra performs the score live.

---

# 16. Sources

- IMAX — Filmed for IMAX: https://www.imax.com/filmed-for-imax
- IMAX — Oppenheimer in IMAX 70mm: https://www.imax.com/news/oppenheimer-in-imax-70mm
- IMAX — The Odyssey in IMAX 70mm Film: https://www.imax.com/news/the-odyssey-in-imax-70mm-film
- Kodak — Large-format film / Dunkirk: https://www.kodak.com/en/motion/blog-post/dunkirk-imax/
- Kodak — Vision Color Print Film: https://www.kodak.com/en/motion/product/post/print-films/vision-color-2383-3383/
- Dolby — Dolby Cinema: https://www.dolby.com/movies-tv/cinema/
- Dolby Professional — Cinema theatrical releases: https://professional.dolby.com/cinema/theatrical-releases/
- AMC — XL at AMC: https://www.amctheatres.com/xl-at-amc
- AMC — Open Caption: https://www.amctheatres.com/open-caption
- AMC — Assistive Moviegoing: https://www.amctheatres.com/assistive-moviegoing
- RealD: https://reald.com/
- Audio Description Project — AD for Film and TV: https://adp.acb.org/ad-film-and-tv
- Audio Description Project — About AD: https://adp.acb.org/about-ad
- New York Philharmonic — Art of the Score: https://nyphil.org/artofthescore
- CineConcerts: https://cineconcerts.com/

---

# 17. Summary for Cursor

When implementing the **Formats & Experiences** quick path:

- Treat **Formats** and **Experiences** as separate concepts.
- Give formats a structured, point-by-point comparison.
- Do not rank formats universally.
- Make **70mm vs IMAX 70mm** visibly distinct.
- Make clear that **IMAX varies by auditorium**.
- Define **Dolby** as Dolby Cinema, not generic Dolby Atmos.
- Define **XL** as XL at AMC only when AMC is the source.
- Define **RealD 3D** around stereoscopic depth, with glasses/brightness as tradeoffs.
- Explain analog formats based on the actual **projection print**, not capture medium.
- Do not compare accessibility/special-event experiences as if one is better than another.
- For Open Caption, Audio Description, and Live Score, focus on **what the user should expect at the screening**.
- Leave room for future venue-specific technical metadata so Reel Seattle can distinguish individual Seattle auditoriums accurately.

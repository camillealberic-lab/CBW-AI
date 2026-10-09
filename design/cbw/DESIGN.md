# CBW AI — design rules (CBW Studio language)

The app takes on the visual language of CBW Studio: Swiss and brutalist, soft black on a white base (light theme by default), square corners, heavy condensed grotesque type, and three flat accent colours with one job each.
Source files: `design/cbw/tokens.css` (variables) and `assets/fonts/fonts.css` (offline fonts).

```html
<link rel="stylesheet" href="../../assets/fonts/fonts.css">
<link rel="stylesheet" href="../cbw/tokens.css">
```

## 1. Non-negotiables
- **Square corners everywhere** (`--rayon: 0`). No pills, no rounded cards, no rounded inputs. The only rounded shape is the macOS Dock squircle, which the OS requires. Exception: a circle is allowed for a single "live" dot when it has to read as a mic or record light.
- **Rules instead of shadows.** Structure comes from `2px solid var(--trait)` borders (cards, inputs, buttons, window header and footer, section ends). Inside a block, separators are `1px solid var(--fil)`. No blur shadows and no glows. The one permitted depth effect is a hard offset shadow `--ombre-dure` (8px 8px 0), used at most once per screen on the main panel. Hover on cards is `0 6px 0 var(--trait)`.
- **No gradients, no glass, no translucency effects.** Colours are flat fills. Two narrow exceptions: the hover *shine* sweep on the primary button, and the fading area fill under a data curve.
- **Soft black is the brand colour** (`--noir` #1E1E1C for text, `--encre` #1C1C1E for large surfaces; never #000/#111). Keep black surfaces small: one primary button per screen, no black nav block. Accents are signals and never decoration. Each screen has at most one big accent area.

## 2. Colour
| Token | Light | Dark | Use |
|---|---|---|---|
| `--fond` | #FFFFFF | #1A1B1D | window background (pure white in light) |
| `--fond-2` | #F4F4F2 | #202124 | sidebar, alt band, wells |
| `--fond-3` | #ECECE8 | #2C2D31 | selected row (nav active), secondary hover |
| `--surface` | #FFFFFF | #25262A | cards, inputs |
| `--texte` | #1E1E1C (16,7:1) | #ECECEA (14,6:1) | primary text |
| `--texte-sec` | #5F5F5A (6,4:1) | #A3A3A0 (6,8:1) | secondary text |
| `--texte-3` | #6E6E6A (5,1:1) | #8C8C88 (5,1:1) | tertiary text, placeholders |
| `--trait` | #1E1E1C | #D9D9D6 | 2px structural rules |
| `--fil` | #DDDDDD | #3A3B3E | 1px hairlines |
| `--fil-fort` | #C4C4BF | #55565B | secondary button / segmented outline |
| `--champ` | #949490 (3:1) | #808186 | input borders |
| `--inverse-fond` / `--inverse-texte` | #1C1C1E / blanc | #ECECEA / #1C1C1E | primary button, dark band |
| `--erreur` | #B3261E | #FF6B5E | errors |

Theme: `appearance.theme` = `light` (default) · `dark` · `system`, applied as `data-theme` on `<html>` before first paint.

The raw brand values are also available: `--noir --blanc --gris --gris-fil --texte-2 --orange --bleu --vert`.

### Three states, one colour each
This applies the site's "one colour per family" idea to the dictation pipeline.

| State | Token | Colour | Text on it | Where |
|---|---|---|---|---|
| **Recording** (mic open, live level) | `--etat-enregistre` | `--orange` #FF5A1F | noir | overlay bars, record dot, the key in the shortcut chip while held, tray state |
| **Processing / AI** (transcription, LLM cleanup, model download) | `--etat-traite` | `--bleu` #2B3BFF | blanc | progress bars, "transcribing…" label, focus ring, links, the selected provider/model |
| **Done / success** (text pasted, saved, test OK) | `--etat-termine` | `--vert` #1FD26A | noir | "Pasted" confirmation, OK badges, connected status |
| Error | `--etat-erreur` | #B3261E | blanc | error text (bold), error badge |
| Idle | `--etat-repos` | noir (light) / gris (dark) | | idle bars, neutral UI |

Contrast: orange and green carry **black** text, blue carries **white** text. Never put white on orange or green.

## 3. Type
- **Archivo** (variable: weight 400–900, `font-stretch` 62–125%) is used for everything else.
- **JetBrains Mono** 500/700 is used for labels, metadata, shortcuts, counters, model names and timings.

| Role | Size | Weight | Stretch | Line height | Letter spacing |
|---|---|---|---|---|---|
| Display (big numbers: timer, word count, "48 H" style) | `--t-display` | 900 | 70% | .78 | -.055em, `tabular-nums` |
| H1 (window title, hero) | 44px (28–44) | 800 | 100% | 1.04 | -.03em |
| H2 (section title) | 40px (34–60) | 900 | 85% | .95 | -.035em |
| H3 (card title) | 22px | 800 | | 1.2 | -.01em |
| Body | 15px | 400 / 500 | | 1.55 | 0 |
| Small / note | 13px | 400 | | 1.45 | 0, `--texte-sec` |
| **Label** | 12px mono | 500 | | 1 | .06em, **UPPERCASE** |
| Buttons | 15px | 800 | | | 0 |

Labels are the system's signature: uppercase mono, often preceded by a 10px square `pastille` in the state colour (`■ ENREGISTREMENT`). In the display style, put the accent on one glyph only, for example the unit in orange (`03:12` in noir with `s` in orange), the way the site puts its "H" in orange.

## 4. Spacing & layout
- 4px base: `--e-1` 4 · `--e-2` 8 · `--e-3` 12 · `--e-4` 16 · `--e-5` 24 · `--e-6` 32 · `--e-7` 48 · `--e-8` 64.
- Layout is grid-based and flush. Blocks butt against each other and are separated by rules, not floating gaps. Tile grids use 12–16px gaps.
- Window header and footer: 2px bottom/top rule, 10–14px vertical padding.
- Colour bars: `--barre-h` 8px high, square, 6px apart, in a 3-column grid (orange / bleu / vert). Use them as the section signature or the progress indicator.

## 5. Components
- **Buttons — three levels, one primary per screen**:
  - *Primary*: `--encre` fill, white text, 44px (56px hero), weight 800, arrow `→` that slides 4px on hover, a light shine sweeps across on hover, very small magnetic pull (≤ 3px).
  - *Secondary*: `--surface` + 1px `--fil-fort`; hover = `--fond-2` + border `--texte`. Never inverts to black.
  - *Tertiary*: text only, `--texte-sec`; hover = `--texte` + underline that draws left→right.
  - States for all: active `scale(.98)` 120ms; focus-visible 3px `--focus` ring, 2px offset; disabled 45 % opacity; loading = three bouncing mini-bars + shimmer; success = green fill + check drawn with `stroke-dashoffset`.
  - *Border beam* (orange → blue light travelling round the square frame) is reserved for one moment: "Activer le nettoyage IA" after the first test dictation.
- **Inputs / selects**: 46px high, 2px `--trait` border, radius 0, 15–16px text. Focus is `outline: 3px solid var(--focus); outline-offset: 2px`. Labels above the field use 13px weight 700, or a mono label.
- **Chips / choices**: 44px high, 2px border, weight 700. The selected chip is inverted (noir background, blanc text).
- **Badges**: flat fill, 3px 8px padding, mono 12px weight 700, no border. Use green "OK", orange "LIVE" or blue "IA".
- **Cards**: 2px border, 22px padding. Optional 10×44px colour bar at the top that grows to 100% on hover (`--ease`).
- **Toggles**: square track 40×22, 1.5px `--champ` border. Off = hollow grey knob; on = track filled `--encre`, white knob. The knob slides with `--ease-ressort`.
- **Segmented controls**: a single thumb (`--encre`) slides under the checked option (320ms, `--ease-ressort`). Same pattern for the sidebar (light grey `--fond-3` row + 3px left bar) and the Réglages index (3px underline).
- **Kbd / shortcut**: mono 12px, 1px border, square, 2px 6px padding.
- **FAQ/accordion style**: rows divided by 2px rules. The "+" sits in a 30px grey square, rotates 45° when open and fills with the section's accent.

## 6. Motion
- Default easing: `--ease` cubic-bezier(.2,.7,.2,1). Indicators/entrances: `--ease-sortie`. Reveal/mask-up: `--ease-rideau` (.7,0,.15,1). Bar growth: `--ease-barre`. Toggles and segment thumbs only: `--ease-ressort` (a slight overshoot, no bounce elsewhere).
- Durations: 120ms (press), 200ms (hover, colour), 320ms (state change, indicator, screen entrance). H1 lines rise out of a mask in 420ms.
- Screen change: sections reveal in a 40ms stagger (rise 10px + fade). Numbers count up (ticker, ease-out-expo, 700ms).
- Launch preloader « A1 · Il parle » (once per session, 1000ms, skippable by click or any key, never blocks routing or the bridge; safety timeout 1400ms): three bars orange / bleu / vert pop in, then speak « C · B · W » with the same voice algorithm as the recording pill (33ms levels, attack .45 / release .12, `lv^0.6`, per-bar jitter + breath); on the last syllable they shoot to full height, widen into a tricolour curtain and lift in cascade (830–990ms) onto the app. No text, no wordmark. Animates `transform` / `opacity` only.
- Bars grow from the left with `scaleX`. Text rises out of a mask.
- Respect `prefers-reduced-motion`: no preloader, no movement, no shimmer/ticker (final values directly).

## 7. Icon & menu bar
- **App icon** (`assets/icon.png`, `assets/logo.svg`): a noir #111 tile on the macOS grid (824px squircle, 100px transparent margin in a 1024 canvas). It holds five square-ended white bars (88px wide, 56px gaps, 240/400/560/400/240 high), and the centre bar is orange, which is the "recording" voice.
- **Mark** (`assets/logo-mark.svg`): the same five bars with no tile, four noir and one orange.
- **Tray** (`assets/tray/*Template*.png`): monochrome template icons with square bars. Idle is the symmetric bars, recording is the asymmetric live bars, and busy is five squares above a baseline rule.
- Rejected variants (kept in `design/cbw/`): B is an orange tile with black bars, which shouts too much in the Dock. C is a grey tile with the three families as bars, which gets busy and muddy at 32px.
- **Wordmark**: "CBW AI" set in Archivo 900, stretch 85%, -.04em, with "AI" optionally in mono 500. Don't reuse the studio's three-letter-tile logo.

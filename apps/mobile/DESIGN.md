# Vidora design: Vitrin

Target: `docs/approved/ekranlar-Vitrin.png`, source `docs/mock/v3/pal6.html`. The interface is white paper, ink and one orange. Firm, poster-like, high contrast. The product video is the hero; ad content (tag chip, big product name, price sticker, button pill) belongs to the video engine and is shown through the engine's real frames, never rebuilt from React Native text.

## Palette (`Theme` in `src/ui.tsx`, the only place colours are defined)

| Token       | Value     | Use                                                              |
| ----------- | --------- | ---------------------------------------------------------------- |
| `bg`        | `#FFFFFF` | Paper, screen background                                         |
| `surface`   | `#F4F3F1` | Secondary surface (editor sheet, placeholders)                   |
| `raised`    | `#ECEAE6` | Tonal fill: inert buttons, progress track                        |
| `line`      | `#E3E0DB` | Hairlines, chip outline                                          |
| `text`      | `#141210` | Ink: text, primary fill, selection, tab tint                     |
| `muted`     | `#6E6A64` | Secondary text                                                   |
| `accent`    | `#FF7A00` | The one accent                                                   |
| `onAccent`  | `#141210` | Ink text on the accent                                           |
| `danger`    | `#C62B1E` | Destructive text and outline                                     |
| `scrim` / `scrimSoft` / `onMedia` | ink 66 % / 18 % / `#FFFFFF` | Labels on photos and video, sheet handle |
| `shadow` / `shadowSoft` | black / 28 % | Shadows                                                  |
| `pressed`   | `#F0EEEA` | A row on `bg` while pressed                                      |

Contrast: ink on paper 18:1, muted on paper 5.0:1, ink on accent 7.6:1, accent on ink 7.6:1 (primary label).

## Type (`src/fonts.ts`, `Type` and `s` in `src/ui.tsx`)

- Display: **Anton**, uppercase, tight leading (`Type.display`, `s.heading`, `Txt big`). Turkish uppercase goes through `useUpper` (İ/I).
- UI: **Manrope** 500 body, 700 emphasis, 800 titles, buttons and labels (`Face.medium|bold|extra`).
- `Type.label`: 10.5 pt, 800, tracked caps (`s.caps`, field and group labels). `Type.numeric`: tabular figures.
- Fonts ship with the video engine (`modules/karevia-editor/ios/fonts`) and are loaded with `expo-font` (part of Expo) in `app/_layout.tsx` after first render; the stack is redrawn once they are in. Every style names the face together with a matching `fontWeight`, so a missing font falls back to the system font in heavy weight. Never block render on fonts.
- Dynamic Type caps (`MaxScale`) are unchanged.

## Buttons

- Primary: ink fill, accent Manrope 800 label, 52 pt, radius 16 (`Radius.button`). One per screen.
- Primary on an ink bar (`onInk`): accent fill, ink label. Secondary on the bar: paper fill.
- Secondary: outlined ink 1.5 pt on paper. Text link (`plain`): underlined ink. Destructive: outlined or text in `danger`.
- Header action (`HeaderAction`): ink capsule with accent label.
- Chips: hairline outline pill; selected = ink fill with accent label.

## Rules

- **One accent.** Orange marks the main action and its echoes only: the focused field fill, the scrubber knob, the headline highlight, a selected label on ink. Never a second hue, never a gradient, no tinted icon tiles.
- Colour literals live in `src/ui.tsx` only; screens and studio panels use tokens (guarded by `src/design-guards.test.mjs`).
- Hierarchy through size, weight and the poster headline, not colour.
- Fields are underlined (1.5 pt ink); the focused field fills with the accent and shows ink text.
- Touch targets at least 44 pt; respect safe areas and the native tab bar (`NativeTabs`, tint = ink).
- Radii: 8, 12, 16 (buttons), 24 (every view of a video); capsules for chips.
- Press: `Press` tokens; light haptic on the primary and selection haptics on chips and segments. Animations use React Native `Animated` only. `LayoutAnimation` (and `KeyboardAvoidingView`, which uses it) is forbidden on Fabric; see `no-layout-animation.test.mjs`.
- Icons are SF Symbols at medium weight. No emoji icons.
- Loading keeps the final layout; errors are inline (`Notice`) and say what to do next.

- **Copy.**
  - Concrete and short, and Turkish first.
  - Use "Ürün fotoğrafını seç", not "Yapay zekânın gücünü keşfet".
  - Say what happens on the phone and what does not leave it.
  - There is no free plan and no "unlimited"/"filigransız"/"sınırsız" wording: previews are free, making videos and images needs Vidora Pro. AI copy is "Apple Intelligence destekli cihazlarda". Stills are the video's end card ("son kare"), never "any frame".
  - Glossary: "Buton yazısı" (not "Çağrı"), "Etiket" (not "Rozet"), "stüdyo ışığı" (not "kabartma ışığı"), "hazırlandı" (not "çizildi") for on-device rendering, "AI Sahne", "Kurgu masası", "Kitaplığa".

## Shared components (`src/ui.tsx`)

- `Screen` — scrolling screen; native title in stacks (`NATIVE_TAB_TITLES`), optional pinned `footer`, keyboard-aware. `ScreenList` — the same header on a SectionList root (Library).
- `Row`, `Section` — plain grouped rows with hairlines (56 pt). `Row` takes `leading`, `external`, `disabled`, `busy` and row accessibility actions. `Section inset` is the iOS inset grouped list with monochrome icon tiles (Settings only). `RowMenuButton` is the visible "…".
- `Segmented` — native-looking control, two to four segments (Library: Videolar / Taslaklar).
- `EmptyState` — `image?`, `icon?`, `title`, `line?`, `action?`.
- `Button` (`busy`, `done`, `large`, `plain`), `SaveShareRow`, `HeaderText`, `Notice` + `useAnnounce`, `TileCaption`, `Choice`, `Field`, `Pill`, `Thumb` (`ratio`, `fit`), `ProgressBar`, `Txt` (`big`, `title`, `muted`, `small`).
- Helpers: `chooseAction`, `openPage`, `deleteClipMessage`, `enPlural`, `formatClock`, `spokenDuration`, `setTabBarHidden`.
- `HeaderOptions` — native navigation bar look for every stack.
- Posters: `Poster` and `TemplateCard` in `src/studio/panels.tsx`, `useTemplatePoster(template, product?, palette?, options?)` in `src/sample-frames.ts`. Without the native module they show a neutral `raised` tile.

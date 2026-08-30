# Mochi Reader Design System

**Project:** Mochi Reader

**Direction:** cozy editorial-kawaii desktop reader; content-first, calm, premium, never dashboard-like.

## Visual signature

The memorable element is a quiet “reading nook” composition: milk-paper surfaces float over a sakura-tinted atmospheric canvas, while one small original mochi-rabbit librarian appears only in welcome and empty states. Illustration never competes with reading content.

## Semantic color system

Components use semantic variables only. Theme files map these roles.

| Role | Sakura Pink | Strawberry Milk | Night Sakura |
|---|---:|---:|---:|
| Canvas | `#FFF2F0` | `#FFFBFA` | `#17131B` |
| Surface | `#FFFFFF` | `#FFFFFF` | `#231D29` |
| Surface soft | `#FFE5E1` | `#FFF2F0` | `#2D2433` |
| Ink | `#3E2D33` | `#3B3033` | `#F8EBEF` |
| Ink muted | `#725D64` | `#75666A` | `#CDBBC2` |
| Accent | `#B94F67` | `#C15A70` | `#E28AA0` |
| Accent soft | `#FFD8D1` | `#FFE5E1` | `#5B3545` |
| Border | `#EDC9C8` | `#F0DAD7` | `#493B50` |
| Success | `#39765C` | `#39765C` | `#7EC3A1` |
| Danger | `#A73D4D` | `#A73D4D` | `#F28A9B` |
| Focus ring | `#8D3650` | `#8D3650` | `#FFB1C2` |

All normal text pairs target WCAG AA 4.5:1. Status never relies on color alone.

## Typography

- Display/headings: bundled **Fraunces Variable**, used sparingly for warmth and editorial character.
- UI/body: bundled **Nunito Sans Variable**, friendly but highly legible.
- Reading serif: bundled **Literata Variable**.
- Reading sans: Nunito Sans; additional options include Georgia and system serif/sans.
- Body base: 16px; UI line-height 1.5; reading line-height defaults to 1.72.
- Reading measure: 60–75 characters; UI labels never below 12px.
- Fonts ship locally with `font-display: swap`; no network font imports.

## Shape, spacing and depth

- 4/8px spacing rhythm; section tiers 16/24/32/48px.
- Controls have at least 44×44px hit areas and 8px separation.
- Radius scale: 10px small controls, 16px panels, 22px cards, 28px hero/modals.
- Borders stay visible in all themes.
- Shadows are warm and restrained: cards `0 12px 36px rgba(116,69,78,.10)`; modal `0 28px 80px rgba(60,31,47,.22)`.
- Blur is reserved for modal scrims and the sidebar shell, not scattered decoration.

## Layout

- Desktop: 232px collapsible sidebar, compact top bar, fluid content canvas; collapsed sidebar is 76px.
- Under 860px: sidebar becomes an overlay drawer; core reading controls stay reachable.
- Main content max width 1480px; readers use their own measure constraints.
- Library grid virtualizes beyond 50 items and preserves filter/scroll state on back navigation.
- Only one primary CTA per screen.

## Components and states

- Lucide outline icons use one 1.75px stroke language; no emoji navigation icons.
- Primary buttons use accent fill; secondary buttons use soft surface; tertiary actions are text/icon.
- Every interactive element has visible hover, pressed, disabled and keyboard-focus states.
- Card hover changes shadow and uses at most a 2px visual lift through transform without reflow.
- Forms always show labels; errors sit under their field with a recovery action.
- Toasts use `aria-live="polite"`, do not steal focus, pause on hover and dismiss in 4 seconds.
- Destructive actions are separated and confirmed; removal from library clearly states that the source file remains.

## Motion

- Micro interaction: 140–180ms; page/modal entrance: 180–240ms; exit is about 65% of enter.
- Animate only opacity and transform. All animation is interruptible and input remains available.
- One coordinated view entrance; no decorative looping motion.
- `prefers-reduced-motion` or the app setting removes spatial transforms, stagger and spring bounce.

## Reader-specific rules

- Reading canvas suppresses application decoration and prioritizes text/pages.
- Toolbars auto-hide but reappear on pointer movement, focus or keyboard navigation.
- Text remains selectable; book copy/search/bookmark actions are reachable without a gesture.
- Manga has visible alternatives for keyboard, page scrub and zoom.
- Night Sakura reduces large-area luminance while maintaining text and control contrast.

## Asset rules

- The mascot is a completely original mochi-rabbit librarian, generated for this project.
- Raster art is reserved for mascot/empty states; navigation and utility graphics remain Lucide SVG.
- Images declare dimensions/aspect-ratio, load lazily below the fold and never contain important UI text.
- Mascot can be disabled globally and is hidden during reading.

## Anti-patterns

- No purple-on-white AI gradient, neon pink, excessive glass, emoji icons or franchise characters.
- No giant analytics dashboard panels, fake controls, hover-only actions or low-contrast pastel text.
- No remote scripts/fonts, animation longer than 400ms or unbounded image grids.

## Delivery checklist

- Keyboard navigation and visible focus on all flows.
- 44×44px targets; text contrast checked in all three themes.
- Reduced motion and UI scale 80–130% verified.
- Layout verified at 800×600, 1024×768, 1440×900 and ultrawide.
- No horizontal overflow; fixed chrome never obscures content.
- Long library is virtualized; image dimensions reserve layout space.

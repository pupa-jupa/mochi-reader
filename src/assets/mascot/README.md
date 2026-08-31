# Mochi mascot asset family

All character poses are generated from `../brand/app-icon-master.png` as the
single visual reference. The invariant features are the cream mochi-rabbit,
raspberry round glasses, coral inner ears, dark chocolate outline, blush, and
soft gouache/paper texture.

Each `*-chroma.png` file is the untouched ImageGen master on a chroma-green
background. The matching `.png` is a deterministic transparent derivative
produced by `scripts/convert-chroma.ps1`; the original master is retained so
the edge mask can be regenerated without quality loss.

Generated 2026-08-30 with ImageGen:

- `empty-library-chroma.png`: holds a raspberry book and welcomes the user.
- `empty-manga-chroma.png`: reads a blank manga booklet with a curious pose.
- `welcome-chroma.png`: waves while carrying a cream/pink/raspberry book stack.

Prompts deliberately forbid text, logos, scenery, shadows, green spill, and
known characters, and request a full-square `#00FF00` chroma-key background.

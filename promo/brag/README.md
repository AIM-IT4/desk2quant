# Desk2Quant launch video

The project includes the BRAG slim skill at `.agents/skills/brag-slim/`. In
Codex CLI, open this repository and ask for `/brag-slim` to make a new video.
The upstream project is https://github.com/latent-spaces/brag.

The Desk2Quant products and sessions video is reproducible with:

```bash
python3 -m pip install Pillow numpy
python3 promo/brag/render.py
```

It writes a 21-second 1280×720 MP4 with original generated music, a poster,
a storyboard, and share copy under `brag-output/`. FFmpeg is required on PATH.
The source screenshots in `assets/` were captured from the public Desk2Quant
product catalog, complete bundle page, session cards, and booking form on
26 September 2026. Prices visible in captured screenshots reflect that date.
The video presents products, then personalized 1-on-1 sessions and the booking
path. It does not submit a booking or show a completed purchase.

For the full upstream `/brag` workflow on another machine, install its skill
and use `npx hyperframes doctor` to check the headless browser and FFmpeg.
The project uses the slim workflow so the video stays reproducible without a
Hyperframes account.

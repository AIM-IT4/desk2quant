# Desk2Quant launch video

The project includes the BRAG slim skill at `.agents/skills/brag-slim/`. In
Codex CLI, open this repository and ask for `/brag-slim` to make a new video.
The upstream project is https://github.com/latent-spaces/brag.

The first Desk2Quant video is reproducible with:

```bash
python3 -m pip install Pillow numpy
python3 promo/brag/render.py
```

It writes a 21-second 1280×720 MP4 with original generated music, a poster,
a storyboard, and share copy under `brag-output/`. FFmpeg is required on PATH.
The source screenshots in `assets/` were captured from the public Desk2Quant
Desk Simulator on 26 September 2026. The P&L numbers and SPX
volatility mismatch are the simulator's fictional incident, not real trading data.

For the full upstream `/brag` workflow on another machine, install its skill
and use `npx hyperframes doctor` to check the headless browser and FFmpeg.
The project uses the slim workflow so the video stays reproducible without a
Hyperframes account.

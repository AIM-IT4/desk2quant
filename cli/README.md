# Desk2Quant Quant Agent CLI

A terminal-based quant learning, problem-solving, interview and project assistant backed by Desk2Quant.

## Requirements

- Node.js 20+
- A paid Desk2Quant purchase using the email you sign in with

## Install

Once the package is published:

```bash
npm install -g @desk2quant/cli
```

For development from this repository:

```bash
cd cli
npm link
```

## Sign in

```bash
d2q login you@example.com
```

Desk2Quant emails the existing My Access magic link. Paste the complete link into the terminal. The CLI exchanges it for a signed Quant Agent session. Model, Razorpay, Supabase and email-service secrets always remain server-side.

## Main commands

```bash
d2q learn "Ito's lemma"
d2q solve "derive E[S_T^2] under GBM"
d2q practice "conditional probability"
d2q interview "quant research"
d2q project "Heston calibration"
d2q progress
```

## Adaptive assessment

```bash
d2q assess probability
d2q submit <assessment-id> "your answer"
d2q skills
```

`theta` is a bounded latent ability estimate updated from graded assessments. It is not a percentage or percentile.

## Private Desk2Quant retrieval

When the signed-in buyer has a Razorpay-verified entitlement to an indexed Desk2Quant product, relevant excerpts from that product can be retrieved server-side and used as grounding. The CLI cannot query the private corpus directly and no paid-book text is bundled with this package.

## Local credentials

The CLI stores only the signed Desk2Quant agent session in `~/.desk2quant/config.json`, created with owner-only permissions where supported. Run:

```bash
d2q logout
```

to remove it.

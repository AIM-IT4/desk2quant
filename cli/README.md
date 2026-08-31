# Desk2Quant Quant Agent CLI v2

A terminal-native quant copilot for learning, rigorous problem solving, interview practice, adaptive assessment and project design.

## Requirements

- Node.js 20+
- A paid Desk2Quant purchase using the same email you sign in with

## Install

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

Desk2Quant emails a My Access sign-in message. For CLI authentication, copy the raw `https://desk2quant.com/my-access.html?email=...&tk=...` URL shown in the dedicated CLI box and paste it at `Magic link >`.

The CLI exchanges that temporary sign-in credential for a signed Quant Agent session. Model, Razorpay, Supabase and email-service secrets remain server-side.

## Launch the dedicated TUI

After sign-in, run:

```bash
d2q
```

This opens the Quant Agent v2 terminal interface. Ask questions naturally; the agent automatically routes the request to the appropriate workflow.

Examples:

```text
Explain why gamma becomes concentrated near the strike as expiry approaches.
Derive the Black-Scholes PDE from a delta-hedged portfolio.
Interview me for an equity derivatives quant role.
Design a production-grade Heston calibration project.
Give me a probability drill focused on conditional expectation.
```

## TUI controls

```text
/mode auto|learn|solve|practice|interview|project
/depth concise|standard|deep
/progress
/skills
/assess <skill>
/submit <assessment-id> <answer>
/context
/history
/sources
/new
/export
/clear
/help
/quit
```

The default mode is `auto`, and the default answer depth is `deep`.

## Multi-turn context

The TUI keeps recent conversation context locally so follow-up questions can refer to the current discussion. For example:

```text
You: I am calibrating Heston to an SPX smile.
You: Why is rho unstable?
```

The second question is interpreted in the context of the Heston calibration discussion rather than as an unrelated definition of rho.

Local TUI history is stored under `~/.desk2quant/` with owner-only permissions where supported. `/new` starts a fresh conversation and `/export` writes the current transcript to a Markdown file in the working directory.

## One-shot commands remain supported

The v1-style commands still work for scripts and quick terminal usage:

```bash
d2q learn "Ito's lemma"
d2q solve "derive E[S_T^2] under GBM"
d2q practice "conditional probability"
d2q interview "quant research"
d2q project "Heston calibration"
d2q progress
d2q whoami
```

## Adaptive assessment

```bash
d2q assess probability
d2q submit <assessment-id> "your answer"
d2q skills
```

`theta` is a bounded latent ability estimate updated from graded assessments. It is not a percentage or percentile.

Supported assessment areas include probability, linear algebra, statistics, stochastic calculus, derivatives, fixed income, numerical methods, programming, risk and quant research.

## Private Desk2Quant retrieval

When the signed-in buyer has a Razorpay-verified entitlement to an indexed Desk2Quant product, relevant excerpts from that product can be retrieved server-side and used as grounding. The CLI cannot query the private corpus directly and no paid-book text is bundled with this package.

The TUI does not fabricate citations. `/sources` only displays source metadata when the backend actually returns it.

## Local credentials

The CLI stores only the signed Desk2Quant agent session in `~/.desk2quant/config.json`, created with owner-only permissions where supported.

To remove the local session:

```bash
d2q logout
```

## Security

- No Desk2Quant model/API secret is shipped in the npm package.
- Purchase entitlement is verified server-side.
- Authentication uses short-lived My Access credentials and a signed local agent session.
- Conversation history is local to the CLI unless included in a user request sent to the Desk2Quant backend for contextual answering.

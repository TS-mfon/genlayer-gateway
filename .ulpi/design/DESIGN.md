# GenLayer Gateway UI Design Language

## Design Read
A cinematic protocol threshold for discovery, followed by a calm operations cockpit for testing: GenLayer judgment should feel powerful at first glance and legible at every transaction boundary.

## Aesthetic Direction
**Black Threshold + Signal Console** — the homepage is a fixed black cinematic stage with restrained silver type, a white action pill, and one visible request path. Inner routes switch to the dark editorial Signal Console with mint status instrumentation. This is not a generic crypto dashboard: the shared signature is a visible boundary sequence that turns asynchronous adjudication into a readable story.

## Register and System
Brand-to-product register. The homepage performs product positioning; inner routes support repeated testing and integration work. Use the existing Next.js app and custom CSS without a component-library dependency.

## Tokens
- Background: `#07100d`; panels: `#0d1915`, `#12221c`; tinted neutral text: `#effff6`, `#b1c6bb`, `#91aa9f`.
- Mint signal: `#64ffb4`; deep mint: `#19c57b`; warning: `#ffc66d`; danger: `#ff7d7d`.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 72.
- Radius scale: 8, 12, 14, 18, 999px.
- Motion: 160ms ease-out for feedback; no decorative animation during transaction states.
- Typography: system sans for interface; monospace only for addresses, hashes, and IDs.
- Landing typography: Manrope where available, silver/white only, with no mint competing with the hero action.

## Signature
The Boundary Sequence: `Your chain → Transport → GenLayer route → Callback`. In the product shell this becomes the Signal Rail: `Created → Claimed → Review → Paid`, with technical lifecycle detail behind “View protocol trace.”

## Voice
Direct, reassuring, and precise. Say “Client wallet signs” instead of “EOA submits calldata.” Say “Waiting for GenLayer” instead of “ADJUDICATING.” Explain trust boundaries without fear language.

## Anti-Slop Rules
- No hero dashboard full of numbers.
- No raw status enums in primary views.
- No unexplained wallet or chain jargon.
- No decorative gradients that compete with actions.
- No modal-first flows; use dedicated routes and inline feedback.

## Accessibility
Visible focus states, semantic headings, labelled controls, keyboard-compatible links/buttons, status text with `aria-live`, and color never used as the only status signal.

# Overview

This repo is intentionally small and composable.

Guiding idea:
- **Sources** create time (events, network, timers)
- **Operators** rewire flows
- **User functions** hold business rules
- **Cancellation** is explicit (unsubscribe)
- **Sharing** is explicit (e.g. `remember()`)

Next: `Workspaces`.

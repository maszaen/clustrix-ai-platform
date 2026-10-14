# Coding-agent tests

```sh
npm test -- --runInBand
npm run test:codes -- --runInBand
npm run test:agent:coverage
npm run test:agent:sqlite # optional; requires native driver built for Node
```

- `code-agent.test.js`: public facade routing, settings, deliberate rollback and lifecycle delegation.
- `code-agent.integration.test.js`: real local HTTP/SSE round trips through all four provider adapters and the filesystem. No paid API calls.
- `edit-operations.test.js`: legacy XML edit regressions, retained for rollback. `add={5}` means insert; `range={5}` means replacement.
- `powershell-session.test.js`: mocked process streams for the legacy terminal; includes fragmented sentinel/status regression. No local PowerShell dependency.
- `../runtime/__tests__/`: modern workspace, protocols, execution loop, process lifecycle, network tools, skills, context and checkpoints.
- `renderer/codes/__tests__/code-chat.test.js`: renderer cancellation settles after IPC listeners detach.

Use `jest.agent.config.js` for the modern runtime coverage gate. See `docs/CODING-AGENT-AUDIT.md` and `docs/CODING-AGENT-RUNTIME.md` for scope and manual Windows/Electron/live-model checks. Protocol fixtures establish transport behavior, not model quality.

`checker/verify-agent-sqlite.js` checks the real database schema, iteration persistence, checkpoint reload and session cleanup with a Node-native better-sqlite3 build. Electron path lookup is the only stub; the database is not mocked.

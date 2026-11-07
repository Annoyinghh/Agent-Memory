# Code intelligence refactor

The agreed direction is a local code intelligence tool that both people and AI agents can understand, inspired by codebase-memory-mcp. Keep the current Python/Next.js stack and public REST/MCP interfaces. Code indexing, structural search, call paths, source evidence and change impact are primary; general memory, sessions and compression remain supporting tools.

Use one workbench instead of parallel full/simplified applications. Keep the code analysis workflows and reuse their query endpoints. Replace decorative avatars and continuously animated galaxies with a bounded, selectable relationship view and a source reader. Load optional panels only when opened. Present project selection, index status and task failures explicitly.

Alternatives considered: keeping both UI implementations preserves duplication; rewriting the backend in C or replacing storage adds migration risk without a project benchmark. Consolidating existing flows gives the smallest useful change. No database migration, dependency growth, destructive index rebuild or edits to business data are required.

Consolidate task execution, upload/restore handling and Graphify parsing at their existing ownership boundaries. Keep path confinement, protected namespaces, durable vector repair and incremental manifests. Use compact structured MCP output and bounded graph requests.

Verify with the existing 47 offline integration tests, focused task/parser/API regressions, frontend lint/build, and a local browser check. Save a source archive outside the project because this checkout has no Git metadata.

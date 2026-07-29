# DWSS Convertor CLI

Standalone Bun/TypeScript utility. Do not import NestJS or service modules.

- Run `bun test` and `bun run typecheck` after source changes.
- DOCX edits must only alter `w:t` contents; do not reconstruct OOXML runs, styles, or package relationships.
- Unknown template functions require an interactive confirmation. Never add a non-interactive bypass.
- POST data URLs require both `--method POST` and a JSON `--body`.
- Keep compatibility helpers generic; do not copy DWSS form business mappings from `dwss-convertor-service`.

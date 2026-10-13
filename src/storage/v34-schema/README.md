# Frozen V3.4 validation boundary

These ten TypeScript files are byte-for-byte copies of `src/domain/*.ts` at
`9aae1d851346d41d191f447e4f7282ddf285771d` (the read-only V3.4 `main` baseline).
`provenance.json` records their original paths and SHA-256 hashes. Do not edit
them to accept V4 fields. Tests verify their bytes and use this exact schema
with the official StorageDomain and JSON backend.

The offline converter deliberately includes this frozen boundary instead of
deriving a purported V3 schema from the evolving V4 validator. It supports
only the official single-file JSON envelope for `marketpilot`, version 1,
with null global and the `projects` table. Other backends/formats fail closed.

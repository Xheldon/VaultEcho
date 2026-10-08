# Changelog

All notable changes to VaultEcho will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.26] - 2024-10-08

### Fixed

- **Critical memory fix for embedding index**: Resolved production OOM crashes (heap >1GB → crash) by replacing JSON-based storage with compact binary format
  - Old format: `embeddings.json` (249MB pretty JSON, full parse/stringify on every operation)
  - New format: `meta.json` (compact, no vectors) + `vectors.<gen>.f32` (binary Float32 rows)
  - Added global index lock to prevent concurrent operations holding multiple full copies in memory
  - Added in-memory cache with mtime-based invalidation to avoid repeated file reads
  - Implemented incremental dirty-only writes instead of full rewrites
  - Added 3-second debounce for post-write auto-indexing to batch multiple updates
  - One-time automatic migration from legacy `embeddings.json` (renamed to `.migrated`)
  - Memory usage reduced from ~1.9GB single rebuild / ~3.3GB concurrent to ~120-200MB peak RSS
  - Atomic crash-safe writes with generation-based switching
  - Automatic cleanup of stale `*.tmp` files older than 1 hour
  - No changes to exported APIs; existing integrations work unchanged

### Changed

- **Default `autoScanIntervalMinutes` changed from 0 (disabled) to 720 (12 hours)**: Reduces unnecessary scanning overhead while still providing reasonable freshness

### Migration Notes

- **Automatic migration on first start**: Legacy `embeddings.json` is automatically converted to the new format without re-embedding
  - The migration requires ~1GB memory with the large index (uses standard JSON.parse)
  - After successful migration, `embeddings.json` is renamed to `embeddings.json.migrated`
  - If migration fails, restore from backup and retry with higher `--max-old-space-size` if needed
- **Expected first-start behavior**: First startup after upgrade will detect and migrate legacy format (~10-30s for large indices)
- **Memory profile**: Post-migration, all operations peak at ~120-200MB RSS even with 1000+ files and 8500+ chunks
- **Rollback procedure**: 
  1. Stop the service
  2. In `data/index/`, rename `embeddings.json.migrated` back to `embeddings.json`
  3. Delete `meta.json` and `vectors.*.f32` files
  4. Downgrade to v0.2.25 or earlier

## [0.2.25] - 2024-09-26

Initial tracked version (pre-CHANGELOG).

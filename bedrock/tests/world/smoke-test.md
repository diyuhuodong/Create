# P7.7 Windows, Realm, and PlayStation Acceptance

This checklist records physical evidence. Node tests cannot change a platform
result from `pending` to `passed`.

## Freeze one candidate

1. Commit all tracked implementation changes. The local `.codegraph/` index is
   excluded from candidate cleanliness and pack hashing.
2. Run `npm test`, `npm run validate`, `npm run matrix`, and
   `npm run acceptance:p7-7:candidate`.
3. Copy the resulting `candidateId`, archive path, archive SHA-256, BP/RP UUIDs,
   and BP/RP versions from `data/p7-7-candidate.json`.
4. Use only that archive for Windows, Realm, and PlayStation. Any BP, RP,
   script, resource, or manifest change invalidates downstream results.

Each run report belongs at:

```text
work/evidence/p7-7/<candidateId>/<platform>/<runId>/report.json
```

The report must follow the P7.7 schema and reference SHA-256 hashed evidence in
the same directory. Record it with:

```bash
npm run acceptance:p7-7:record -- --report work/evidence/p7-7/<candidateId>/<platform>/<runId>/report.json
```

## Windows Bedrock

Import the immutable `.mcaddon` into the current non-Preview Windows Bedrock
client. Create or open the versioned acceptance world, activate both packs,
enable the Creator Content Log file and GUI, and record the exact client build.

Run these scenarios:

- `candidate_identity`
- `pack_import_dependencies`
- `content_log_script_boot`
- `content_acquisition`
- `language_guide`
- `recipes_processing`
- `fluids_heat`
- `kinetics_network`
- `redstone_controls`
- `logistics_packages`
- `contraptions_schematics`
- `trains_schedules`
- `equipment_tools`
- `visual_audio_particles`
- `restart_chunk_recovery`
- `two_player_concurrency`
- `stress_30_minutes`

Use a second Bedrock account for the two-player cases. Compare W1 configured,
W2 in-flight, and W3 restored checkpoints after save/quit, chunk unload, and
rejoin. The 30-minute run must retain bounded diagnostics and zero crashes,
watchdogs, or unrecoverable disconnects.

## Test Realm

Download a Realm backup before replacing its world. Upload the exact Windows
acceptance world and verify that both packs download automatically. Join with
two accounts and run:

- `candidate_identity`
- `pack_import_dependencies`
- `content_log_script_boot`
- `content_acquisition`
- `language_guide`
- `recipes_processing`
- `fluids_heat`
- `kinetics_network`
- `redstone_controls`
- `logistics_packages`
- `contraptions_schematics`
- `trains_schedules`
- `equipment_tools`
- `visual_audio_particles`
- `restart_chunk_recovery`
- `two_player_concurrency`
- `realm_distribution_reconnect`
- `stress_30_minutes`

Exercise shared endpoints, fluid competition, moving assemblies, train route
conflicts, all-player disconnect/rejoin, and a two-player 30-minute mixed-domain
run. Download the completed Realm world and reopen it on Windows to inspect
persisted state.

## PlayStation

Join the same Realm with the linked Microsoft account; do not claim a local
PlayStation sideload. Keep a Windows observer online to capture Content Log and
`/scriptevent createbedrock:diagnostics` output. Use controller screenshots or
video for forms, riding, equipment, and visual evidence.

Run these PlayStation checks:

- `candidate_identity`
- `pack_import_dependencies`
- `content_acquisition`
- `language_guide`
- `recipes_processing`
- `fluids_heat`
- `kinetics_network`
- `redstone_controls`
- `logistics_packages`
- `contraptions_schematics`
- `trains_schedules`
- `equipment_tools`
- `visual_audio_particles`
- `restart_chunk_recovery`
- `two_player_concurrency`
- `realm_distribution_reconnect`
- `stress_30_minutes`

The final pressure run uses PlayStation plus Windows for at least 30 minutes.
Verify automatic pack download, controller focus, disconnect/reconnect, train
riding, dynamic machinery, native redstone, and bounded server diagnostics.

## Close the campaign

Run `npm run acceptance:p7-7:validate` and
`npm run acceptance:p7-7:status`. A campaign is `platform_verified` only when
every applicable scenario is passed on the same candidate, all evidence hashes
resolve, and no P0-P2 defect remains open. Failed runs are never overwritten;
fixes require a new pack version, candidate, Windows regression, and downstream
Realm/PlayStation reruns.

# Create Bedrock Migration

This directory contains the Bedrock Add-On reimplementation of Create. It is isolated from the Java/NeoForge Gradle project.

## Current Phase

Phase 0 establishes a reproducible Behavior Pack (BP), Resource Pack (RP), validation tooling, and a source-derived migration matrix. It does not yet claim runtime feature parity.

The first runtime slice is `hand_crank -> shaft/cogwheel -> millstone`, with mechanical-bearing and basic track/train prototypes. `npm run build` stages selected Java block textures and converts the direct-element models for the crank base, shaft, cogwheel, millstone, and bearing into generated Bedrock geometry. The contraption and train marker entities also have client geometry and render controllers. These generated/imported resources are not duplicated in source control. Parent composition, OBJ tracks, animated components, and the remaining model catalog still need explicit conversion before visual parity is claimed.

## Commands

Run commands from this directory with Node.js 22 or newer:

```bash
npm run matrix
npm run validate
npm run build
npm run pack
npm test
```

`npm run matrix` updates `data/migration-matrix.json` from the Java registration entry points. The generator records statically declared identifiers; dynamic registrations remain manual-review items until they are explicitly mapped.

`npm run deploy:win` copies built packs to the Windows Bedrock development directory specified by `BEDROCK_DEV_ROOT`. `npm run pack` creates a `.mcaddon` archive after a successful build.

Build output includes `resource_pack/create-java-asset-provenance.json`, which lists the imported texture sources. Keep this import list explicit: do not bulk-copy `src/main/resources/assets/` into the repository or package.

For the Windows smoke test, activate both packs in a new world and use `/give @s createbedrock:hand_crank`, `/give @s createbedrock:shaft`, `/give @s createbedrock:cogwheel`, and `/give @s createbedrock:millstone`. Place adjacent blocks, then interact with the hand crank and inspect the Content Log for the activation message.

## Layout

```text
behavior_pack/     Bedrock behavior definitions and server scripts
resource_pack/     Bedrock models, textures, sounds, and language files
data/              Tracked migration scope and source mappings
tests/             Node tests for platform-independent logic
tools/             Build, validation, packaging, and inventory tools
```

See [the full migration design](/Users/dong/work/doc/create-bedrock-realm-full-migration-design.md) for scope, architecture, risk gates, and Realm/PS acceptance criteria.

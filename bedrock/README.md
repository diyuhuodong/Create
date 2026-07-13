# Create Bedrock Migration

This directory contains the Bedrock Add-On reimplementation of Create. It is isolated from the Java/NeoForge Gradle project.

## Current Phase

Phase 0 establishes a reproducible Behavior Pack (BP), Resource Pack (RP), validation tooling, and a source-derived migration matrix. It does not yet claim runtime feature parity.

The first runtime slices are `hand_crank -> shaft/cogwheel -> millstone`, `hand_crank -> mechanical_press`, and `hand_crank -> crushing_wheel`. Mechanical-bearing and basic track/train prototypes are also present. A manually toggled clutch currently passes or isolates a whole shaft line; redstone control and Create's side-specific split-shaft behavior remain future work. A belt-connector prototype persists 20-block shaft-to-shaft links with Create-compatible axis and slope constraints, and carries kinetic speed; it does not yet place belt blocks, render belts, consume the connector, or transport items. The bearing prototype can now carry shafts, both cogwheel sizes, gearboxes, clutches, mills, presses, and crushing wheels; it restores snapped quarter-turn positions, updates the kinetic index, and migrates in-progress machine processing state where an adapter exists. `npm run build` stages selected Java block/item textures and converts the direct-element models for the crank base, shaft, cogwheel, millstone, press, and bearing into generated Bedrock geometry. Train markers interpolate continuously across flat and one-block-rise track edges. These generated/imported resources are not duplicated in source control. The crushing wheel and tracks use Java OBJ models, which require a separate converter; the current wheel uses its imported plate texture on temporary block geometry. Parent composition, animated components, and the remaining model catalog still need explicit conversion before visual parity is claimed.

## Commands

Run commands from this directory with Node.js 22 or newer:

```bash
npm run matrix
npm run recipes:crushing
npm run recipes:pressing
npm run validate
npm run build
npm run pack
npm test
```

`npm run matrix` updates `data/migration-matrix.json` from the Java registration entry points. The generator records statically declared identifiers; dynamic registrations remain manual-review items until they are explicitly mapped.

`npm run recipes:pressing` imports the non-compat pressing recipes that can be represented with available Bedrock items. The import report identifies recipes still blocked on missing items or compatibility mappings.

`npm run recipes:crushing` imports crushing recipes with native Bedrock inputs and outputs. The report tracks recipes blocked on Create-specific materials or compatibility content.

`npm run deploy:win` copies built packs to the Windows Bedrock development directory specified by `BEDROCK_DEV_ROOT`. `npm run pack` creates a `.mcaddon` archive after a successful build.

Build output includes `resource_pack/create-java-asset-provenance.json`, which lists the imported texture sources. Keep this import list explicit: do not bulk-copy `src/main/resources/assets/` into the repository or package.

For the Windows smoke test, activate both packs in a new world and use `/give @s createbedrock:hand_crank`, `/give @s createbedrock:shaft`, `/give @s createbedrock:cogwheel`, and `/give @s createbedrock:millstone`. Place adjacent blocks, then interact with the hand crank and inspect the Content Log for the activation message. For the belt prototype, use `/give @s createbedrock:belt_connector`; use it on two valid shafts in the same dimension to persist a kinetic link.

## Layout

```text
behavior_pack/     Bedrock behavior definitions and server scripts
resource_pack/     Bedrock models, textures, sounds, and language files
data/              Tracked migration scope and source mappings
tests/             Node tests for platform-independent logic
tools/             Build, validation, packaging, and inventory tools
```

See [the full migration design](/Users/dong/work/doc/create-bedrock-realm-full-migration-design.md) for scope, architecture, risk gates, and Realm/PS acceptance criteria.

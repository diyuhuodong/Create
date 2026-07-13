# Create Bedrock Migration

This directory contains the Bedrock Add-On reimplementation of Create. It is isolated from the Java/NeoForge Gradle project.

## Current Phase

Stage 2 has a static implementation for the kinetic, 16-block contraption, and minimum-train risk prototypes. It does not claim Windows, Realm, PS, or full Create feature parity until the recorded acceptance checklist passes.

The stage-2 mechanical-bearing prototype accepts 16 explicitly adapted types: eleven kinetic or processing blocks plus andesite, brass, and copper casings, industrial iron blocks, and zinc blocks. Every accepted type has a visual contraption part; the five structural blocks also register an explicit stateless capture/detach/restore adapter. The prototype enforces the 16-block limit at collection, snapshot, restore, and runtime assembly boundaries.

The first runtime slices are `hand_crank -> shaft/cogwheel -> millstone`, `water_wheel -> shaft/cogwheel -> millstone`, `hand_crank -> mechanical_press`, and `hand_crank -> crushing_wheel`. The water-wheel prototype supplies fixed power when water occupies an adjacent position perpendicular to its axle; flow direction, lava, and large wheels remain future work. Mechanical-bearing and basic track/train prototypes are also present. A manually toggled clutch currently passes or isolates a whole shaft line; redstone control and Create's side-specific split-shaft behavior remain future work. Encased chain drives carry power through adjacent perpendicular chain segments; chain gearshifts and model state variants remain future work. A belt-connector prototype persists 20-block shaft-to-shaft links with Create-compatible axis and slope constraints, and carries kinetic speed; it does not yet place belt blocks, render belts, consume the connector, or transport items. The bearing prototype can now carry shafts, both cogwheel sizes, gearboxes, clutches, mills, presses, and crushing wheels; it restores snapped quarter-turn positions, updates the kinetic index, and migrates in-progress machine processing state where an adapter exists. Train markers interpolate continuously across flat and one-block-rise track edges. New trains use a two-carriage prototype that follows the reserved route with fixed spacing. Two adjacent track stations can be used in sequence to create a persistent two-stop loop with a 20-tick dwell; schedules and prototype carriage formation, but not full Create station assemblies, signals, bogeys, or cargo, survive reload. Kinetic, contraption, and train records now use a versioned persistence envelope while still accepting the prior unwrapped snapshots. `npm run build` stages selected Java block/item textures and converts the direct-element models for the crank base, shaft, cogwheel, millstone, press, bearing, and water wheel into generated Bedrock geometry. These generated/imported resources are not duplicated in source control. The crushing wheel and tracks use Java OBJ models, which require a separate converter; the current wheel uses its imported plate texture on temporary block geometry. Parent composition, animated components, and the remaining model catalog still need explicit conversion before visual parity is claimed.

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

`npm run matrix` updates schema-v2 `data/migration-matrix.json` from the Java registration entry points. Each generated entry includes a planned phase, functional domain, resource state and acceptance id; these are reviewable scope classifications, not evidence that the feature is implemented. Dynamic registrations remain manual-review items until they are explicitly mapped.

`npm run recipes:pressing` imports the non-compat pressing recipes that can be represented with available Bedrock items. The import report identifies recipes still blocked on missing items or compatibility mappings.

`npm run recipes:crushing` imports crushing recipes with native Bedrock inputs and outputs. The report tracks recipes blocked on Create-specific materials or compatibility content.

`npm run deploy:win` copies built packs to the Windows Bedrock development directory specified by `BEDROCK_DEV_ROOT`. `npm run pack` creates a `.mcaddon` archive after a successful build.

With cheats enabled, a Game Director can run `/scriptevent createbedrock:diagnostics summary` to write compact scheduler, kinetic, contraption, train, and dynamic-property diagnostics to the Content Log. The command source also receives the summary when the Script API provides one.

Build output includes `resource_pack/create-java-asset-provenance.json`, which lists the imported texture sources. Keep this import list explicit: do not bulk-copy `src/main/resources/assets/` into the repository or package.

For the Windows smoke test, activate both packs in a new world and use `/give @s createbedrock:hand_crank`, `/give @s createbedrock:shaft`, `/give @s createbedrock:cogwheel`, and `/give @s createbedrock:millstone`. Place adjacent blocks, then interact with the hand crank and inspect the Content Log for the activation message. For the belt prototype, use `/give @s createbedrock:belt_connector`; use it on two valid shafts in the same dimension to persist a kinetic link. To set a train loop, interact with two track stations in sequence; sneak-interact with a station to toggle a train at its linked track between stopped and released. A non-air block in a carriage's one-block clearance space freezes the train; remove it to release the collision freeze automatically.

## Layout

```text
behavior_pack/     Bedrock behavior definitions and server scripts
resource_pack/     Bedrock models, textures, sounds, and language files
data/              Tracked migration scope and source mappings
tests/             Node tests for platform-independent logic
tools/             Build, validation, packaging, and inventory tools
```

See [the full migration design](/Users/dong/work/doc/create-bedrock-realm-full-migration-design.md) for scope, architecture, risk gates, and Realm/PS acceptance criteria.

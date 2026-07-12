# Contraption Runtime Boundary

`ContraptionController` owns assembly, rollback, disassembly, and serialized state. `BedrockContraptionWorldPort` is its only Bedrock API adapter: it converts loaded block permutations to snapshots, writes blocks back, and creates the persistent marker entity.

The marker entity is intentionally not a renderer. Rendering a multi-block contraption, collision proxies, actor ticks, passengers, and transformations are separate phase-2 adapters. This boundary keeps world transactions testable before the Windows/Realm runtime gate.

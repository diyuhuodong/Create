# Contraption Runtime Boundary

`ContraptionController` owns assembly, rollback, disassembly, and serialized state. `BedrockContraptionWorldPort` is its only Bedrock API adapter: it converts loaded block permutations to snapshots, writes blocks back, and creates the persistent marker entity.

The marker entity is intentionally not a renderer. A conservative swept voxel check freezes bearing rotation when a moving assembly would intersect a non-air world block; marker/entity collision, passengers, and full transformations remain separate phase-2 adapters. This boundary keeps world transactions testable before the Windows/Realm runtime gate.

# Bedrock Smoke-Test World

This checklist is executed only after the code-completion milestone, on Windows Bedrock and then on a test Realm.

1. Deploy both packs with `npm run deploy:win` and activate them in a new survival test world. Confirm the Content Log is clean.
2. Build a mixed kinetic line with crank, shafts, both cog sizes, gearbox, clutch, chain drive, water wheel, millstone, press, and crushing wheel. Check normal power, overload stall, source conflict, broken links, and recovery.
3. Connect two valid shafts with the belt connector. Reject a cross-dimension or over-length attempt; break one endpoint; then restart the world and verify one restored link only.
4. Start a millstone, press, and crushing wheel. Restart during processing, then assemble/disassemble each on a bearing. Confirm progress, inputs, and outputs neither duplicate nor disappear.
5. Assemble a connected 16-block bearing contraption containing all five structural blocks. Verify rotation, collision freeze, occupied-space rejection, entity deletion/recovery, and two-player repeated interaction.
6. Build flat, curved, and one-block-rising track. Run two two-carriage trains through a reservation conflict, a chunk unload/reload, world-block collision, player collision, and restart while the rear carriage is still clearing the final edge.
7. Upload the same world to the test Realm; repeat steps 2-6 with two players and then on PS. Record Windows, Realm, and PS results separately.

Do not mark stages 1 or 2 as platform-accepted until every item has a recorded Windows, Realm, and PS result.

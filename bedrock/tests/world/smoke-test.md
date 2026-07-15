# Bedrock Smoke-Test World

This checklist is executed only after the code-completion milestone, on Windows Bedrock and then on a test Realm.

1. Deploy both packs with `npm run deploy:win` and activate them in a new survival test world. Confirm the Content Log has no error or warning.
2. Use `/scriptevent createbedrock:diagnostics` as an operator. Confirm it returns valid JSON counters, includes scheduler/persistence data, and contains no item stacks, inventory slots, player data, or coordinates.
3. Obtain the S3 static blocks from the creative menu. Verify their English and Chinese names, item visuals, placed visuals, and source textures load without missing-texture markers. Inspect the Crushing Wheel's oversized toothed geometry, a one-to-three-block belt run (start/middle/end caps), and one-to-three Tank columns at empty, water, and lava fill levels; record each platform's render result.
4. Build a mixed kinetic line with crank, shafts, both cog sizes, gearbox, clutch, chain drive, water wheel, millstone, press, and crushing wheel. Check normal power, overload stall, source conflict, broken links, and recovery.
5. Apply and remove vanilla redstone power to Andesite Funnel, Clutch, Gearshift, Sequenced Gearshift, Adjustable Chain Gearshift, and Mechanical Pump. Confirm each fails closed across a chunk unload/reload and resumes only after a zero-power sample. Record native consumer/producer behavior separately as each pending S3-14 device is implemented on the 1.26.0 target.
6. Connect two valid shafts with the belt connector. Reject a cross-dimension or over-length attempt; break one endpoint; then restart the world and verify one restored link only.
7. Start a millstone, press, and crushing wheel. Restart during processing, then assemble/disassemble each on a bearing. Confirm progress, inputs, and outputs neither duplicate nor disappear.
8. Assemble a connected 16-block bearing contraption containing all five structural blocks. Verify rotation, collision freeze, occupied-space rejection, entity deletion/recovery, and two-player repeated interaction.
9. Build flat, curved, and one-block-rising track. Run two two-carriage trains through a reservation conflict, a chunk unload/reload, world-block collision, player collision, and restart while the rear carriage is still clearing the final edge.
10. Run a two-player, 30-minute pressure pass on Windows, the test Realm, and PS. On each platform, repeat steps 2-9; record Content Log errors/warnings, kernel pending/failed counters, scheduler executed/deferred counters, and Dynamic Property bytes.
11. Save a separate evidence report for every passed or failed platform scenario, then update `data/s3-15-platform-acceptance.json` with its path. A pending scenario must keep `evidence: null`; do not mark a platform passed until all nine scenarios have evidence.

Do not mark any stage as platform-accepted until every item has a recorded Windows, Realm, and PS result.

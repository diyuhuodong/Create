# Bedrock Smoke-Test World

This checklist is executed only after the code-completion milestone, on Windows Bedrock and then on a test Realm.

1. Deploy both packs with `npm run deploy:win` and activate them in a new survival test world.
2. Confirm the Content Log contains no errors while loading the packs.
3. Give and place `createbedrock:hand_crank`, `shaft`, `cogwheel`, and `millstone`.
4. Insert wheat and cobblestone into the millstone interaction flow; turn the crank until products appear.
5. Leave and rejoin the world while a millstone is processing; verify progress resumes.
6. Upload the same world to the test Realm; repeat with at least two players and then on PS.

Do not mark stages 1 or 2 as platform-accepted until every item has a recorded Windows, Realm, and PS result.

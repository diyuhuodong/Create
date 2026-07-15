# Repository Guidelines

## Project Structure & Module Organization

Create is a Java 21 NeoForge mod. Production code is in `src/main/java/com/simibubi/create`, grouped by feature (for example, `content/kinetics`, `content/trains`, and `infrastructure`). Templates that produce build metadata live in `src/main/java-templates` and `src/main/templates`.

Resources belong in `src/main/resources`: assets under `assets/create`, data under `data/create`, and GameTest structures under `data/create/structure/gametest`. Generated data is committed in `src/generated/resources`; regenerate it instead of manually editing generated files. Gradle configuration is rooted in `build.gradle` and version/configuration properties in `gradle.properties`.

## Build, Test, and Development Commands

- `./gradlew build` compiles sources, processes resources, and creates the mod JAR.
- `./gradlew runClient` starts a development Minecraft client.
- `./gradlew runServer` starts the development server without a GUI.
- `./gradlew runData` regenerates data and assets into `src/generated/resources`.
- `./gradlew runGameTestServer` runs the GameTest suite; this and `build` are required by CI.

Use the Gradle wrapper, not a system Gradle installation. Ensure `JAVA_HOME` selects Java 21.

## Coding Style & Naming Conventions

Follow `.editorconfig`: Java uses tabs; Markdown and general files use four spaces; JSON and YAML use two spaces. Use UTF-8, LF line endings, no trailing whitespace, and a final newline. Keep Java packages lowercase and feature-oriented. Use `PascalCase` for classes, `camelCase` for members and methods, and `UPPER_SNAKE_CASE` for constants. Preserve the import grouping and blank-line conventions visible in nearby classes; no formatter or linter task is configured.

## Testing Guidelines

Add or update GameTest coverage for behavior changes, with fixtures placed in the matching `data/create/structure/gametest/<area>/` directory. Name fixtures descriptively, such as `brass_tunnel_split.nbt`. Run `./gradlew runGameTestServer` before opening a PR, and run `./gradlew runData` whenever registrations, recipes, tags, or generated resources change; commit the resulting resource updates.

## Commit & Pull Request Guidelines

Recent history uses concise, imperative subjects such as `Fix Ejector at high distances` and conventional prefixes where useful (`fix:`, `perf:`). Keep commits focused and avoid unrelated formatting churn. PRs should explain the player-facing or technical change, link the relevant issue when applicable, include reproduction/testing notes, and attach screenshots or video for visible gameplay/UI changes. Do not include credentials or publish tokens; publishing is handled by CI secrets.

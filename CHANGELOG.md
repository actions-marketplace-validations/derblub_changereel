# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-10-13

- Narration with a model of Anthropic (`--model claude-opus-5-5`, key in `ANTHROPIC_API_KEY`), for better sentences and for where there is no local model.
- The action narrates: inputs `narrate`, `anthropic-api-key` and `voice`.
- A new page is described by what it is about.
- Narration: a sentence is no longer cut off at a full stop inside quoted text, and a part that grew a lot is shown to the model as it is now, not next to the short part it was.

## [0.2.0] - 2026-10-13

- `--narrate`: a local model in Ollama says in one sentence what each change is; the sentence is shown under the page.
- `--voice`: Piper speaks the sentences, and a scene lasts as long as its sentence.

## [0.1.0] - 2026-10-13

- Compares every route of two versions of a site and renders the changes as a video: the page before, a wipe to the page after, a frame around what differs.
- Pages are compared like text files whose lines are rows of pixels, so a new section is "added" and what it pushed down is not "changed".
- Takes the two versions from two running sites (`--before`, `--after`) or builds and serves them from a repository (`--base`, `--build`, `--serve`).
- Leaves out what is not stable: waits until a page has settled, visits it more than once, does not draw frames, compares an app shell and its content apart, and takes `--ignore` selectors.
- GitHub Action with a job summary and the video as an output.

[Unreleased]: https://github.com/derblub/changereel/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/derblub/changereel/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/derblub/changereel/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/derblub/changereel/releases/tag/v0.1.0

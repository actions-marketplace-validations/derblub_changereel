# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

- A scene is made like a screen recording: a browser window takes most of the picture, the page scrolls to the place, a pointer clicks "After" and goes on to the change, and the sentence runs under the window as the subtitle.
- The pages are shown with twice the pixels, so they stay sharp when the camera moves closer.

- The spoken sentence follows the voice word by word.
- The window has a bar with the address and a line around it.

- The video has a new look: a column that says what the change is next to a window that shows the page at its true size, an opening card with the facts of the run, a closing card that lists the changes, and a row of cells that counts the scenes.
- The window moves closer to a small change once it is framed.
- The frame around changed pixels grows to the words they belong to, so a changed digit no longer cuts a price in two.
- `reel.json` next to the video holds what it was rendered from.

## [0.4.0] - 2026-10-13

- `--language de` (input `language`): German sentences and German words in the video.
- The README shows a video.

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

[Unreleased]: https://github.com/derblub/changereel/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/derblub/changereel/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/derblub/changereel/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/derblub/changereel/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/derblub/changereel/releases/tag/v0.1.0

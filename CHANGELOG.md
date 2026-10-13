# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-13

- Compares every route of two versions of a site and renders the changes as a video: the page before, a wipe to the page after, a frame around what differs.
- Pages are compared like text files whose lines are rows of pixels, so a new section is "added" and what it pushed down is not "changed".
- Takes the two versions from two running sites (`--before`, `--after`) or builds and serves them from a repository (`--base`, `--build`, `--serve`).
- Leaves out what is not stable: waits until a page has settled, visits it more than once, does not draw frames, compares an app shell and its content apart, and takes `--ignore` selectors.
- GitHub Action with a job summary and the video as an output.

[Unreleased]: https://github.com/derblub/changereel/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/derblub/changereel/releases/tag/v0.1.0

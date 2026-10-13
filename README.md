<div align="center">

<a href="https://pushingpixels.at">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/logo-light.svg">
    <img src="docs/assets/logo.svg" alt="Pushing Pixels" width="96">
  </picture>
</a>

<h1>changereel</h1>

<p><strong>Find what a change did to the pages of a site and show it as a before and after video.</strong></p>

<p>
  <a href="https://github.com/derblub/changereel/actions/workflows/ci.yml"><img src="https://github.com/derblub/changereel/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
</p>

<p>
  <a href="#how-it-finds-a-change">How it works</a> ·
  <a href="#what-it-leaves-out-so-that-a-change-is-a-change">What it leaves out</a> ·
  <a href="#in-a-pull-request">GitHub Action</a> ·
  <a href="#on-the-command-line">Command line</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

</div>

---

> [!NOTE]
> Early work. The comparison, the silent video and the GitHub Action work. Narration is not there yet.

A pull request says what changed in the code. What changed on the screen, the reviewer has to find by clicking through a preview. **changereel** opens every page of the site before and after the change, works out where the two differ and renders a short video: the page before, a wipe to the page after, and a frame around what is different.

```console
changereel --base main --build "npm ci && npm run build" --serve "npm run preview -- --port {port}"
```

It runs on your machine. No account, no service, no model: the comparison is arithmetic on screenshots.

## How it finds a change

A page is compared like a text file whose lines are its rows of pixels. A section that was added pushes everything below it down, and a pixel by pixel comparison would call all of that changed. Aligning the rows first tells "this band is new" from "this band moved":

| Kind | Means |
| --- | --- |
| **Added** | Rows that exist only after the change: a new section, or a whole new page. |
| **Removed** | Rows that exist only before it. |
| **Changed** | Rows at the same place on both sides whose pixels differ. The video frames the pixels, not the full width. |

Blank rows match anywhere, so bands are judged by their other rows, and more or less white space alone is not reported. A change that is the same on several pages, such as a new link in the header, is one scene that says on how many pages it is.

## What it leaves out, so that a change is a change

A real page is not the same picture on every visit. Compared with itself, the site this was tried on first reported 8 changes on 6 pages. The steps below bring that down, not to zero: a testimonial picked at random still gets through on some runs.

- **It waits until the page has settled.** Parts that load when the browser is idle arrive after the load event. A page is captured when its markup and its heights have stopped moving.
- **It visits every page more than once.** What differs between two visits of the same version, such as a random testimonial, is left out on both sides, together with what sits right next to it.
- **It does not draw frames.** A captcha, a map or a video player belongs to someone else and loads in another state each time. Frames keep their place and stay empty.
- **It compares an app shell and its content apart.** On a page that scrolls inside an element, next to a sidebar that stays, the window is made taller to show all of the content, and the sidebar is compared as the window shows it. Stretched to the height of the content, it would differ whenever the content got longer.
- **It ignores a handful of pixels.** A hairline that rendered one shade off is not shown; a changed digit is.

The price is that a change that lies mostly inside or right next to an unstable part is not seen. `--passes` and `--noise-margin` move the line between a false alarm and a missed change.

What you know to be random, name with `--ignore`. On the site this was tried on, two selectors (a testimonial picked at random, a logo whose gradient starts at a random point) took the comparison of a version with itself from 6 changes to none, and the comparison of two real versions to 14 changes, each of them one the commit had made.

## In a pull request

The action builds and serves the base of the pull request and its head, compares them, writes the list of changes to the job summary and renders the video.

```yaml
name: What changed
on: pull_request

jobs:
  changereel:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0 # the base commit has to be there
      - uses: derblub/changereel@v0
        id: reel
        with:
          build: npm ci && npm run build
          serve: npm run preview -- --port {port}
          ignore: .testimonial, .hero-video
      - uses: actions/upload-artifact@v7
        if: steps.reel.outputs.video
        with:
          name: what-changed
          path: ${{ steps.reel.outputs.video }}
```

| Input | Default | Description |
| --- | --- | --- |
| `serve` | | Command that serves one version; `{port}` is replaced by the port to listen on. Required. |
| `build` | | Command that builds one version, run in each of the two checkouts. |
| `base` | base of the pull request | Commit, branch or tag to compare with. |
| `head` | `HEAD` | Commit to show as the version after the change. |
| `routes` | | Paths to compare. Empty reads them from the sitemaps of both versions. |
| `ignore` | | CSS selectors, separated by commas, of parts to leave out of the comparison. |
| `title` | title of the pull request | Title on the first card. |
| `video` | `true` | `false` only compares. |
| `passes` | `2` | How often each page is captured. |
| `max-scenes` | `8` | Scenes in the video. |
| `ready-timeout` | `120` | Seconds to wait for a served version to answer. |

| Output | Description |
| --- | --- |
| `changes`, `pages` | Number of visible changes, and of pages that have one. |
| `video` | Path to the video. Empty when nothing changed. |
| `report` | Path to `changes.json`. |

Each version is built in its own git worktree, so two installs and two builds run in the job. The first render downloads the browser Remotion renders with, about 100 MB.

## On the command line

From a repository, with the versions built and served for you:

```console
changereel --base main --build "npm ci && npm run build" --serve "npm run preview -- --port {port}"
```

Or between two sites that are already running, such as the live site and a local build:

```console
changereel --before https://example.com --after http://localhost:3000
```

| Option | Default | Description |
| --- | --- | --- |
| `--base` | | Commit, branch or tag to build and serve as the version before. Needs `--serve`. |
| `--head` | `HEAD` | Commit to build and serve as the version after. Uncommitted changes are not part of it. |
| `--build` | | Command that builds a version, run in each checkout. |
| `--serve` | | Command that serves a version on `{port}`. |
| `--before`, `--after` | | Instead of `--base`: addresses of two running sites. |
| `--routes` | | Paths to compare, separated by spaces. Empty reads them from the sitemaps of both sites. |
| `--sitemap` | | URL or file of one sitemap to read the routes from instead. |
| `--ignore` | | CSS selectors, separated by commas, of parts to leave out of the comparison: a random testimonial, an animated logo. They stay in the video. |
| `--out` | `out` | Directory for the screenshots, `changes.json` and `changereel.mp4`. |
| `--title` | `What changed` | Title on the first card. |
| `--width` | `1280` | Width of the browser window. |
| `--wait` | `500` | Milliseconds to wait after a page has loaded, before it is watched until it has settled. |
| `--passes` | `2` | How often each page is captured. More visits find more of what is not stable. |
| `--noise-margin` | `64` | Rows above and below an unstable part that count as part of it. |
| `--per-route` | `2` | Scenes per page, largest change first. |
| `--max-scenes` | `8` | Scenes in the video. |
| `--no-video` | | Only compare and write `changes.json`. |

You need Node 22 or newer and a Chrome or Chromium (`CHROME_PATH` when it is not in a usual place). The video is rendered with [Remotion](https://www.remotion.dev), which downloads its own browser on the first run. Remotion has its own [licence](https://www.remotion.dev/docs/license): free for individuals and small teams, paid for larger companies.

## Development

```console
npm install
npm test
node test/run-demo.mjs        # compares the two sample sites in test/site and renders out/changereel.mp4
```

## Contributing

A page where it reports a change that is none, or misses one that is there, is the most useful report. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup, and the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues go through [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Daniel Kurdoghlian, Pushing Pixels. The typeface in the video, Google Sans Flex, is under the SIL Open Font License.

---

<div align="center">
  <a href="https://pushingpixels.at">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/assets/pushing-pixels-dark.svg">
      <source media="(prefers-color-scheme: light)" srcset="docs/assets/pushing-pixels-light.svg">
      <img src="docs/assets/pushing-pixels.svg" alt="Pushing Pixels" width="320">
    </picture>
  </a>
  <p>Built and maintained by <a href="https://pushingpixels.at">Daniel Kurdoghlian</a> at <a href="https://pushingpixels.at">Pushing Pixels</a> in Vienna.<br>
  I build <a href="https://pushingpixels.at/creates/web-apps">custom software</a> and the pipelines that ship it.</p>
</div>

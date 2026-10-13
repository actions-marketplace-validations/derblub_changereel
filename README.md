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

</div>

---

> [!NOTE]
> Early work. The comparison and the silent video work; narration, a GitHub Action and building the two versions for you are not there yet.

A pull request says what changed in the code. What changed on the screen, the reviewer has to find by clicking through a preview. **changereel** opens every page of the site before and after the change, works out where the two differ and renders a short video: the page before, a wipe to the page after, and a frame around what is different.

```console
npx changereel --before https://example.com --after http://localhost:3000
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

## Usage

Both versions of the site have to be running: the live site and a local build, or two builds on two ports.

| Option | Default | Description |
| --- | --- | --- |
| `--before`, `--after` | | Addresses of the two running sites. Required. |
| `--routes` | | Paths to compare, separated by spaces. Empty reads them from the sitemaps of both sites. |
| `--sitemap` | | URL or file of one sitemap to read the routes from instead. |
| `--out` | `out` | Directory for the screenshots, `changes.json` and `changereel.mp4`. |
| `--title` | `What changed` | Title on the first card. |
| `--width` | `1280` | Width of the browser window. |
| `--wait` | `500` | Milliseconds to wait after a page has loaded. |
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
  <p>Built and maintained by <a href="https://pushingpixels.at">Daniel Kurdoghlian</a> at <a href="https://pushingpixels.at">Pushing Pixels</a> in Vienna.</p>
</div>

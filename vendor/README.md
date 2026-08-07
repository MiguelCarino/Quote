# Third-party code bundled here

Everything this project needs is vendored: it loads no script, style, font, map
or module from anywhere but its own origin — no CDN, no network, no account.
That is the point of the tool (a quote never leaves the machine), and it makes
the licences below *this project's* responsibility rather than a package
manager's.

**Every library here has its licence text in this directory.** Naming a licence
is not the same as shipping it: MIT and BSD both require the permission text
itself to travel with a copy, and most minified bundles drop it. Where a bundle
does carry the full text inline, the row says so and no separate file is needed.

Four libraries: one to read and write spreadsheets, three to render a quote to
PDF.

## What is here, and under what licence

| File | Package | Version | Licence | Licence text |
| --- | --- | --- | --- | --- |
| `xlsx.full.min.js` | [SheetJS](https://sheetjs.com) | 0.18.5 | Apache-2.0 | [`LICENSE-xlsx.txt`](LICENSE-xlsx.txt) |
| `jspdf.umd.min.js` | [jsPDF](https://github.com/parallax/jsPDF) | 2.5.1 | MIT | **Inline** — `@license` block carries the full MIT text |
| `jspdf.plugin.autotable.min.js` | [jsPDF-AutoTable](https://github.com/simonbengtsson/jsPDF-AutoTable) | 3.5.28 | MIT | [`LICENSE-jspdf-autotable.txt`](LICENSE-jspdf-autotable.txt) — header names MIT, omits the permission text |
| `html2canvas.min.js` | [html2canvas](https://html2canvas.hertzen.com) | 1.4.1 | MIT | [`LICENSE-html2canvas.txt`](LICENSE-html2canvas.txt) — same |

Originally sourced from `cdnjs.cloudflare.com`.

## The one entry that needs thought before you redistribute

**SheetJS is Apache-2.0**, and §4 asks more than MIT does: a redistribution must
carry a copy of the licence, must reproduce any upstream `NOTICE` file, and must
mark any file you modified as changed. The copy vendored here is unmodified and
upstream 0.18.5 shipped no `NOTICE`. Both facts are recorded in
`LICENSE-xlsx.txt`; if you bump the version, re-check both.

Note also that SheetJS moved distribution off npm after 0.18.x. A newer release
may come under different terms — read them rather than assuming this row still
holds.

## The rule

Adding a file to this directory means adding a row here, and its licence text
beside it, **in the same commit**. A record kept from the first vendored file is
trivial; one reconstructed two years later is not.

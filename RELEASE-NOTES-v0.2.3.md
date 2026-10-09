# dsh-auto-paste v0.2.3

Declares DSH compatibility explicitly, so the plugin store can list this plugin again.

## What changed

- **`dsh.compatibility` added to the manifest.** DSH STORE unlisted the entry because its catalog recorded `unknown` for every DSH release — including the latest three it checks — and its policy requires an exact `compatible` record at a fixed commit ([AI-Scarlett/DSH-Store#934](https://github.com/AI-Scarlett/DSH-Store/issues/934)). The cause was simply that the manifest never carried a `dsh.compatibility` block, so there was nothing to read.

  ```json
  "compatibility": {
    "dsh": "^0.1.5-rc.1 || ^0.2.0-rc.2",
    "dshReleases": {
      "0.1.5-rc.2": "compatible",
      "0.1.7-rc.2": "compatible",
      "0.2.0-rc.2": "compatible"
    },
    "profiles": ["web"]
  }
  ```

  Only versions this plugin has actually run on are declared; everything else stays unclaimed, so the catalog keeps defaulting it to `unknown` instead of reading a claim that cannot be backed:

  | DSH release | Status | Basis |
  |---|---|---|
  | `0.1.5-rc.2` | compatible | the line this repository develops and tests against (`devDependencies`) |
  | `0.1.7-rc.2` | compatible | the daily-driver web profile, and the build 0.2.2 was verified on |
  | `0.2.0-rc.2` | compatible | the desktop runtime in use, whose `runtime.json` reports `desktopVersion: 0.2.0-rc.2` |

- **No runtime behavior changed.** The paste path, the reference chip, the one-shot hint and the settings row are untouched by this release.

## Also worth recording

The catalog entry also carries `credentials: ["api-key"]`, which this plugin does not use. That value is not produced by the store's own rule set: replaying `permissionSignals()` (`src/automation-source-policy.mjs` upstream) over the scannable files of `v0.1.4`, `v0.1.5` and `HEAD` yields **zero hits on all three credential patterns**, while `files: "write"` (derived from `mkdir(` / `readFile(`) is correct. The permission block carries no provenance to check against, unlike `assurance.discovery`, so the origin cannot be traced from the record. Written up in the same issue; nothing to change on our side for it.

## Install

```bash
dsh plugin --profile <your-profile> add dsh-auto-paste@next
```

**Full diff:** https://github.com/sakuraqqq/dsh-auto-paste/compare/v0.2.2...v0.2.3

# Vidora – GitHub Pages site

Static privacy policy and support pages for the Vidora iOS app. The app and App Store Connect link to:

- https://berkdemirokk.github.io/vidora/privacy
- https://berkdemirokk.github.io/vidora/support

These URLs only work if the contents of this folder are the **root** of a public repository named `vidora` under the `berkdemirokk` account.

## Contents

| Path | Purpose |
|------|---------|
| `index.html` | Landing page with links to Privacy and Support |
| `privacy/index.html` | Privacy policy (Turkish + English), from `docs/store/privacy-policy.md` |
| `support/index.html` | Support / FAQ (Turkish + English), from `docs/store/support.md` |
| `.nojekyll` | Empty file; tells GitHub Pages to serve files as-is without Jekyll |

No build step, external scripts or fonts. Each page has its own inline `<style>`.

## Publish steps

1. **Create the repository.** On GitHub, create a new **public** repository `berkdemirokk/vidora` (no README, license or .gitignore, so the first push is clean).

2. **Push the contents of `docs/site` to the root of `main`.** Push the files inside this folder, not the folder itself:

   ```bash
   cd docs/site
   git init -b main
   git add -A          # includes the hidden .nojekyll file
   git commit -m "Publish Vidora privacy and support pages"
   git remote add origin https://github.com/berkdemirokk/vidora.git
   git push -u origin main
   ```

   After the push, `index.html`, `privacy/`, `support/` and `.nojekyll` must sit at the top level of the repository.

3. **Enable GitHub Pages.** In the repository go to **Settings > Pages**, set **Source** to "Deploy from a branch", choose branch **main** and folder **/ (root)**, then save. The first deployment takes about a minute.

4. **Verify both URLs return 200.**

   ```bash
   curl -sIL https://berkdemirokk.github.io/vidora/privacy | grep -i "^HTTP"
   curl -sIL https://berkdemirokk.github.io/vidora/support | grep -i "^HTTP"
   ```

   Each should end in `HTTP/2 200`. A `301` to the trailing-slash URL (`/privacy/`) before the `200` is expected GitHub Pages behaviour. Also open both URLs on a phone and check that Turkish characters (ç, ğ, ı, İ, ö, ş, ü) render correctly.

## Updating

Edit the Markdown sources in `docs/store/`, mirror the changes in the matching `index.html`, update the "Last updated" date in both, and push again. If the AI Studio / workstation pairing is ever turned on in the app, the privacy policy must be updated before that build ships.

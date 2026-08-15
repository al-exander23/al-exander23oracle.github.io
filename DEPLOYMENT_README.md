# ALX Oracle — fixed diagnostic deployment package

This package fixes only the diagnostic integration. It is not a fix for the visual Oracle bug.

Upload the **contents of this archive** directly into the root of the GitHub Pages repository. The uploaded root must contain `index.html`, the `js/` directory, `css/`, `data/`, and `js/diagnostic.js`.

The root `index.html` must retain this exact script tag:

```html
<script src="./js/diagnostic.js?v=ghost1"></script>
```

After GitHub Pages redeploys, open:

`https://YOUR-PAGES-URL/?debug=1&diag=1&ghost=1`

A panel titled `ALX FORENSICS · TELEGRAM` with `REFRESH`, `COPY DIAGNOSTICS`, and `REMOVE PHRASE` must appear. If it does not, open the deployed page source and confirm the exact script tag is present; then open `https://YOUR-PAGES-URL/js/diagnostic.js?v=ghost1` and confirm it returns JavaScript rather than the repository 404 page.

Do not upload only the `js/` directory. Do not place the package inside an extra nested directory. Do not overwrite the production branch unless the temporary diagnostic deployment is intended to replace it for testing.

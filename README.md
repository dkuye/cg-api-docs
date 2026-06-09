# CG API Docs 🚀

**CG API Docs** is a portable, self-contained, and high-performance Swagger (OpenAPI v2.0) documentation viewer built with **Vue 3**, **TypeScript**, and **TailwindCSS v4**. It is packaged as a native **Web Component** (`<cg-api-doc>`) that can be embedded directly in any HTML page or library using script and style tags hosted on **unpkg.com**.

To accommodate strict **Content Security Policies (CSP)**, the package is distributed in two formats:
1. **Split Files (Recommended for strict CSP):** Separate `.js` and `.css` files. This avoids dynamic runtime CSS injection in the browser.
2. **Combined File:** A single `.min.js` file with styles bundled directly inside the script.

---

## ⚡ Quick Start & Usage

The package is hosted on **unpkg.com** and is available in version `1.0.3`.

### Option A: Separate JS and CSS (Recommended for strict CSP)
Load the stylesheet and the script separately. This is the best way to satisfy strict `style-src` and `script-src` policies:

```html
<!-- 1. Load the CSS Stylesheet -->
<link rel="stylesheet" href="https://unpkg.com/cg-api-docs@1.0.3/dist/cg-api-doc.css">

<!-- 2. Load the pure JavaScript script (no dynamic injection) -->
<script src="https://unpkg.com/cg-api-docs@1.0.3/dist/cg-api-doc.js"></script>
```

### Option B: Combined JS and CSS (Zero Config)
If you want a single-file import and do not have restrictive CSP settings, you can load the all-in-one script. It dynamically injects the stylesheet into the document head at runtime:

```html
<script src="https://unpkg.com/cg-api-docs@1.0.3/dist/cg-api-doc.min.js"></script>
```

---

## 📄 HTML Sample Usage (Split Configuration)

Here is a complete, standalone HTML template that imports and renders the API documentation viewer using the split JS and CSS files:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Developer API Reference</title>
  
  <!-- 1. Load the CG API Docs CSS stylesheet -->
  <link rel="stylesheet" href="https://unpkg.com/cg-api-docs@1.0.3/dist/cg-api-doc.css">
  
  <!-- 2. Load the CG API Docs JS script -->
  <script src="https://unpkg.com/cg-api-docs@1.0.3/dist/cg-api-doc.js"></script>

  <style>
    /* Ensure the body expands to fill the full viewport */
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: sans-serif;
    }
  </style>
</head>
<body>

  <!-- 3. Instantiate the Web Component and pass your Swagger JSON URL -->
  <cg-api-doc url="https://petstore.swagger.io/v2/swagger.json"></cg-api-doc>

</body>
</html>
```

---

## ⚙️ Component Configuration

### Element Attributes
| Attribute | Type | Description |
| :--- | :--- | :--- |
| `url` | `string` | The HTTP/HTTPS URL of your OpenAPI/Swagger 2.0 specification. If omitted, the viewer attempts to load a default `/swagger.json` from the current origin. |

### Dynamic Behavior
The `<cg-api-doc>` custom element observes the `url` attribute. If you dynamically modify the `url` attribute using JavaScript, the component will automatically unmount the current instance, fetch the new spec, and re-render without reloading the page:

```javascript
const docElement = document.querySelector('cg-api-doc');
// Dynamically switch Swagger specifications
docElement.setAttribute('url', 'https://api.example.com/v2/swagger.json');
```

---

## 🛠️ Key Capabilities in the Viewer
Once embedded, the viewer provides a rich interactive environment out-of-the-box:

- **Live Request Sandbox ("Try It Out"):** Submit tests directly from your browser. Automatically formats query parameters, path variables, request bodies, and supports file uploads (`multipart/form-data`).
- **Real-Time cURL Builder:** Auto-generates exact shell commands as inputs change.
- **Smart Schema Mocks:** Automatically parses schema references (`$ref`, `allOf`) to generate mock request JSONs. Uses smart name matching to output mock emails, tokens, and UUIDs.
- **JSON Tree Fold Viewer:** Formats JSON responses with nested, collapsible trees and syntax highlighting.
- **Global Auth & Headers Control:** Define tokens (such as Bearer keys) globally to automatically authorize sandbox requests.
- **Persistent Preferences:** Automatically saves Dark/Light mode selections and custom header settings inside `localStorage`.

---

## 🔒 Content Security Policy (CSP) Troubleshooting

If users integrating this package receive a CSP violation error similar to:
> *Loading the script 'https://unpkg.com/cg-api-docs@1.0.3/dist/cg-api-doc.js' violates the following Content Security Policy directive: "script-src 'self'"...*

This means the host website blocks external domains or dynamic script-injected CSS. Use the following methods to resolve it:

### Method 1: Use the Split files with whitelist (Recommended)
By using the **Split files** setup, you avoid triggering `style-src` inline/unsafe-inline style blocks. They should add `https://unpkg.com` to their server's `Content-Security-Policy` header:

```http
Content-Security-Policy: default-src 'self'; script-src 'self' https://unpkg.com; style-src 'self' https://unpkg.com;
```

### Method 2: Self-Host the Files (Zero External CSP Config)
If they cannot allow external CDNs in their CSP headers, they can host the files directly:
1. Download both the JS and CSS files:
   - JavaScript: `https://unpkg.com/cg-api-docs@1.0.3/dist/cg-api-doc.js`
   - Stylesheet: `https://unpkg.com/cg-api-docs@1.0.3/dist/cg-api-doc.css`
2. Place these files inside their project's public static assets directory (e.g. `/public/js/` and `/public/css/`).
3. Load them locally in their HTML document:
   ```html
   <link rel="stylesheet" href="/css/cg-api-doc.css">
   <script src="/js/cg-api-doc.js"></script>
   ```
   Because the files are served from their own origin, it satisfies the `"script-src 'self'"` and `"style-src 'self'"` directives perfectly.

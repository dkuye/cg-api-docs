# CG API Docs 🚀

**CG API Docs** is a portable, self-contained, and high-performance Swagger (OpenAPI v2.0) documentation viewer built with **Vue 3**, **TypeScript**, and **TailwindCSS v4**. It is packaged as a native **Web Component** (`<cg-api-doc>`) that can be embedded directly in any HTML page or library using a single script tag hosted on **unpkg.com**.

---

## ⚡ Quick Start & Usage

The package is hosted on **unpkg.com** and resolves all dependencies, templates, and styles internally.

### CDN Script URL
- **Explicit Versioned URL (Recommended):**
  ```html
  <script src="https://unpkg.com/cg-api-docs@1.0.1/dist/cg-api-doc.js"></script>
  ```
- **Latest Version URL:**
  ```html
  <script src="https://unpkg.com/cg-api-docs/dist/cg-api-doc.js"></script>
  ```

---

## 📄 HTML Sample Usage

Here is a complete, standalone HTML file that imports and renders the API documentation viewer:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Developer API Reference</title>
  
  <!-- 1. Load the CG API Docs script bundle from unpkg -->
  <script src="https://unpkg.com/cg-api-docs@1.0.1/dist/cg-api-doc.js"></script>

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

  <!-- 2. Instantiate the Web Component and pass your Swagger JSON URL -->
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

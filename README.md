# CG API Docs 🚀

**CG API Docs** is a portable, standalone, and high-performance Swagger (OpenAPI v2.0) documentation viewer built with **Vue 3**, **TypeScript**, and **TailwindCSS v4**. It is designed to be easily embedded as a native **Web Component** (`<cg-api-doc>`) in any web page or library, or run as a standalone documentation portal.

The application allows developers to browse API endpoints, inspect data schemas, generate mock payloads, and test live queries directly from their browser using a highly responsive, modern interface.

---

## 🌟 Key Features & Capabilities

### 1. Zero-Dependency Web Component Integration
- **Fully Self-Contained:** Bundles into a single JavaScript file (`cg-api-doc.js`).
- **Dynamic CSS Injection:** Styling (`style.css`) is automatically injected into the head of the document at runtime. This avoids the need for external stylesheet references.
- **Reactive Attribute Binding:** Supports the reactive `url` attribute. If you change the URL programmatically, the viewer instantly re-fetches and renders the new spec:
  ```html
  <cg-api-doc url="https://api.yoursite.com/swagger.json"></cg-api-doc>
  ```

### 2. Live "Try It Out" Request Client
- **Dynamic Inputs:** Automatically generates form controls for path, query, header, and body parameters based on the OpenAPI specification.
- **Content-Type Handling:**
  - Standard JSON request payloads (`application/json`).
  - URL-encoded form data (`application/x-www-form-urlencoded`).
  - File upload inputs (`multipart/form-data`) supporting native file selection.
- **cURL Command Generation:** Real-time generation of reproducible cURL requests based on inputs.
- **Response Metrics:** Monitors and displays HTTP status codes, execution duration (response time in milliseconds), and response headers.

### 3. Smart Mock & Schema Parser
- **Recursive Resolution:** Parses local definition schemas (`$ref`) and resolves complex nested structures.
- **Support for Combinators:** Gracefully handles combined properties (`allOf`, `anyOf`, and `oneOf`).
- **Smart Heuristics:** Automatically populates fields with realistic sample data based on description clues (e.g., generating sample email, password, UUID, JWT, and phone number strings instead of generic fields).
- **Circular Reference Protection:** Safe parsing cycle detector that prevents browser lockups on circular schema references.

### 4. Interactive JSON Responses & Schema Visualizer
- **Custom JSON Tree Viewer (`JsonFoldViewer`):** Allows collapsible inspection of deep nested response payloads with syntax highlighting.
- **Interactive Schema Trees:** Renders parameters and response definitions in a hierarchical, interactive tree representation showing types, required status, and descriptions.
- **Clipboard Helpers:** One-click copying for response bodies, headers, and cURL commands.

### 5. Premium UI/UX & Controls
- **Dual Themes:** Clean Dark Mode (default) and Light Mode with persistence via `localStorage`.
- **Global Headers Manager:** Setup credentials (like a Bearer `Authorization` token) or customized header keys that apply globally to all testing requests.
- **Router-Free Navigation Sync:** Uses standard browser History API (`pushState`/`popstate`) to synchronize selection without relying on `vue-router`, ensuring clean standalone HTML page embedding.
- **Sidebar Search & Filtering:** Collapsible tag-grouped sidebar navigation with real-time text filters and fast HTTP-method badges (GET, POST, PUT, DELETE, PATCH).

---

## 📂 Project Structure

```bash
├── public/                  # Static assets (default local swagger.json files)
├── scripts/
│   └── post-build.js        # Post-process script that injects CSS bundle inside JS bundle
├── src/
│   ├── assets/              # App styles (including Tailwind directives)
│   ├── components/
│   │   ├── ApiViewer.vue    # The primary API client & layout component (67KB)
│   │   └── JsonFoldViewer.vue # Interactive JSON tree collapsible component
│   ├── utils/
│   │   └── swaggerParser.ts # OpenAPI parser, mock generator, and schema resolver
│   ├── router/              # SPA router configuration (fallback mode)
│   ├── main.ts              # Custom Web Component registration wrapper
│   └── App.vue              # Main wrapper for local development
├── vite.config.ts           # Bundler configuration (inline imports & build target config)
├── package.json             # Build commands and dependency tracking
└── tsconfig.json            # TypeScript type settings
```

---

## 🛠️ Build and Development Setup

Ensure you have Node.js (>=20.19.0 or >=22.12.0) and **pnpm** (or npm/yarn) installed.

### Development Mode (SPA Sandbox)
Run a local development server with Vite:
```bash
pnpm dev
```

### Production Build (Bundle Web Component)
Compiles, builds, and post-processes the portable Custom Element bundle:
```bash
pnpm build
```
During the build process, the following sequence occurs:
1. `vue-tsc` runs type checks.
2. `vite build` bundles the application and splits CSS into `style.css`.
3. `scripts/post-build.js` reads the CSS file, injects it dynamically as a `<style>` injection routine into the bundled `cg-api-doc.js`, and removes the temporary CSS file.

The resulting bundle is saved in the `/dist` directory.

---

## 🚀 Embedding the Web Component

To use the standalone component in any project (whether React, Angular, Svelte, or vanilla HTML/PHP), you can either host the build files locally or fetch them via a CDN.

### Option A: CDN Hosting (unpkg or jsDelivr)

You can load the script directly from CDN providers without hosting it yourself:

#### 1. unpkg CDN
- **Direct Access (Explicit version & path):**
  ```html
  <script src="https://unpkg.com/cg-api-docs@1.0.1/dist/cg-api-doc.js"></script>
  ```
- **Auto-Redirect to Bundle (Resolves to configured `main` bundle):**
  ```html
  <script src="https://unpkg.com/cg-api-docs@1.0.1"></script>
  ```
- **Always Latest Version (Not recommended for production):**
  ```html
  <script src="https://unpkg.com/cg-api-docs/dist/cg-api-doc.js"></script>
  ```

#### 2. jsDelivr CDN
- **Direct Access:**
  ```html
  <script src="https://cdn.jsdelivr.net/npm/cg-api-docs@1.0.1/dist/cg-api-doc.js"></script>
  ```
- **Auto-Redirect:**
  ```html
  <script src="https://cdn.jsdelivr.net/npm/cg-api-docs@1.0.1"></script>
  ```

### Option B: Local Hosting

1. **Include the Script Tag:**
   ```html
   <script src="dist/cg-api-doc.js"></script>
   ```

### Render the Custom Element

After loading the script via CDN or local path, render the custom tag in your HTML:

```html
<cg-api-doc url="https://petstore.swagger.io/v2/swagger.json"></cg-api-doc>
```

### Custom Element Attributes
| Attribute | Type | Description |
| :--- | :--- | :--- |
| `url` | `string` | The HTTP/HTTPS endpoint of your Swagger / OpenAPI 2.0 specification. If omitted, the viewer falls back to loading `/swagger.json` from the local origin. |

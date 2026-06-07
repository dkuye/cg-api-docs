import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, '../dist')

const cssPath = path.join(distDir, 'style.css')
const jsPath = path.join(distDir, 'cg-api-doc.js')
const htmlPath = path.join(distDir, 'index.html')

if (fs.existsSync(cssPath) && fs.existsSync(jsPath)) {
  const cssCode = fs.readFileSync(cssPath, 'utf8')
  const jsCode = fs.readFileSync(jsPath, 'utf8')

  // Inject CSS styles into the document head when the JS file is executed on a page
  const injectionCode = `(function(){
    if(typeof document !== 'undefined'){
      var style = document.createElement('style');
      style.textContent = ${JSON.stringify(cssCode)};
      document.head.appendChild(style);
    }
  })();\n`

  fs.writeFileSync(jsPath, injectionCode + jsCode, 'utf8')
  console.log('Successfully injected style.css into cg-api-doc.js!')

  // Copy to root directory for direct root CDN access (e.g. unpkg.com/cg-api-docs/cg-api-doc.js)
  const rootJsPath = path.join(__dirname, '../cg-api-doc.js')
  fs.writeFileSync(rootJsPath, injectionCode + jsCode, 'utf8')
  console.log('Copied bundle to root directory for direct root CDN access.')

  // Delete style.css since it is now bundled in the js file
  fs.unlinkSync(cssPath)
  console.log('Removed temporary style.css.')

  // Clean up dist/index.html link stylesheet tag
  if (fs.existsSync(htmlPath)) {
    let htmlCode = fs.readFileSync(htmlPath, 'utf8')
    htmlCode = htmlCode.replace(/<link[^>]*href="[^"]*style\.css"[^>]*>/gi, '')
    fs.writeFileSync(htmlPath, htmlCode, 'utf8')
    console.log('Cleaned up style.css reference from index.html.')
  }
} else {
  console.error('Could not find dist/style.css or dist/cg-api-doc.js!')
}

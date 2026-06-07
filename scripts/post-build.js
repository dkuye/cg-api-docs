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

  // Delete style.css since it is now bundled in the js file
  if (fs.existsSync(cssPath)) {
    fs.unlinkSync(cssPath)
    console.log('Removed temporary style.css.')
  }

  // Clean up all other files in the dist directory except cg-api-doc.js
  if (fs.existsSync(distDir)) {
    const files = fs.readdirSync(distDir)
    for (const file of files) {
      const filePath = path.join(distDir, file)
      const stat = fs.statSync(filePath)
      if (stat.isFile() && file !== 'cg-api-doc.js') {
        fs.unlinkSync(filePath)
        console.log(`Removed unneeded build file: dist/${file}`)
      }
    }
  }

  // Clean up the root-level cg-api-doc.js file if it exists from previous builds
  const rootJsPath = path.join(__dirname, '../cg-api-doc.js')
  if (fs.existsSync(rootJsPath)) {
    fs.unlinkSync(rootJsPath)
    console.log('Removed legacy root-level cg-api-doc.js.')
  }
} else {
  console.error('Could not find dist/style.css or dist/cg-api-doc.js!')
}

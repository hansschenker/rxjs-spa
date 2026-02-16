import fs from 'fs'
import path from 'path'
import { renderToString } from '../../packages/ssr/src/index'
import { html } from '../../packages/dom/src/index'
import { of } from 'rxjs'
import { map } from 'rxjs/operators'

import './ssr-setup'

// Import app views (mocking router/store dependencies for simplicity in this demo)
// In a real app, you'd hoist the view factories out of main.ts or import them directly.
// Here we'll just demonstrate the SSR engine with a fresh template.

const pageTemplate = (title: string, content: any) => html`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title} - RxJS SPA</title>
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
  <div id="app">
    <nav>
      <a href="/">Home</a>
      <a href="/about">About</a>
    </nav>
    <main>
      ${content}
    </main>
  </div>
</body>
</html>
`

const homeView = html`
  <h1>Welcome to SSR</h1>
  <p>This page was statically generated!</p>
`

const aboutView = html`
  <h1>About</h1>
  <ul>
    ${of(['RxJS', 'TypeScript', 'Vite']).pipe(
  map(technologies => technologies.map(t => html`<li>${t}</li>`))
)}
  </ul>
`

async function generate() {
  const distDir = path.resolve(process.cwd(), 'apps/demo/dist')
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true })

  console.log('Generating Home...')
  const homeHtml = await renderToString(pageTemplate('Home', homeView))
  fs.writeFileSync(path.join(distDir, 'index.html'), homeHtml)

  console.log('Generating About...')
  const aboutHtml = await renderToString(pageTemplate('About', aboutView))
  fs.writeFileSync(path.join(distDir, 'about.html'), aboutHtml)

  console.log('Done! Check apps/demo/dist/')
}

generate().catch(console.error)

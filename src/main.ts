import './assets/main.css'
import { createApp } from 'vue'
import ApiViewer from './components/ApiViewer.vue'
import router from './router'

// 1. Define vanilla Web Component Wrapper
class CgApiDocElement extends HTMLElement {
  private app: any = null

  static get observedAttributes() {
    return ['url']
  }

  connectedCallback() {
    const urlAttr = this.getAttribute('url') || undefined
    // Create and mount the Vue app inside the Custom Element container directly
    this.app = createApp(ApiViewer, { url: urlAttr })
    this.app.mount(this)
  }

  disconnectedCallback() {
    if (this.app) {
      this.app.unmount()
      this.app = null
    }
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === 'url' && oldValue !== newValue && this.app) {
      this.app.unmount()
      this.app = createApp(ApiViewer, { url: newValue || undefined })
      this.app.mount(this)
    }
  }
}

// Register Custom Element globally
if (typeof window !== 'undefined' && !customElements.get('cg-api-doc')) {
  customElements.define('cg-api-doc', CgApiDocElement)
}

// 2. Mount standard App for local development (if #app is present in index.html)
const appElement = document.getElementById('app')
if (appElement) {
  const app = createApp(ApiViewer)
  app.use(router)
  app.mount('#app')
}

import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const sharedAlias = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    resolve: { alias: sharedAlias },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        ...sharedAlias
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html')
        }
      }
    }
  }
})

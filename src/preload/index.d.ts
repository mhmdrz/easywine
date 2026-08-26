import type { EasyWineApi } from './index'

declare global {
  interface Window {
    easywine: EasyWineApi
  }
}

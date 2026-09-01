/// <reference types="vite/client" />

import type { SideNotchAPI } from "../shared/types";

declare global {
  interface Window {
    sideNotch: SideNotchAPI;
  }
}

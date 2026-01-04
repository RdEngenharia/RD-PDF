// FIX: Replaced '/// <reference types="vite/client" />' because the type definition file could not be found.
// This custom module declaration provides the necessary types for '?url' imports,
// which is a Vite-specific feature used in this project for workers.
declare module '*?url' {
  const src: string
  export default src
}

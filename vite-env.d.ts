// FIX: Replaced the reference to 'vite/client' which was not being found.
// This declaration provides the necessary types for '?url' imports used for web workers in the project.
declare module '*?url' {
  const src: string
  export default src
}

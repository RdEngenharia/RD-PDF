// FIX: Replaced the reference to "vite/client" with a manual declaration
// to resolve the "Cannot find type definition file" error. This is likely
// caused by a tsconfig.json misconfiguration. This manual declaration ensures
// that asset imports with the `?url` suffix are correctly typed as strings.
declare module '*?url' {
  const src: string;
  export default src;
}

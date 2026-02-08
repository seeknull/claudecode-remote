export function encodeDir(path: string): string {
  return btoa(path).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeDir(encoded: string): string {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  return atob(base64);
}

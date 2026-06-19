/** Base path for GitHub Pages (/world-cup/) and local root (/). */

export function getAppBasePath() {
  const path = location.pathname;
  if (path.endsWith('/')) return path;
  const slash = path.lastIndexOf('/');
  const lastSegment = path.slice(slash + 1);
  // /world-cup without trailing slash still lives under that folder on GitHub Pages
  if (!lastSegment.includes('.')) return `${path}/`;
  if (slash <= 0) return '/';
  return path.slice(0, slash + 1);
}

export function resolveAppPath(relativePath = '') {
  const base = getAppBasePath();
  const clean = String(relativePath).replace(/^\//, '');
  if (!clean) return base;
  return `${base}${clean}`;
}
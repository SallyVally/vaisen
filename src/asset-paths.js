const base = import.meta.env.BASE_URL;
export function assetUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return value;
  if (base !== '/' && value.startsWith(base)) return value;
  return base + value.slice(1);
}
function resolveAssets(value) {
  if (typeof value === 'string') return value.startsWith('/') ? assetUrl(value) : value;
  if (Array.isArray(value)) return value.map(resolveAssets);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveAssets(item)]));
  return value;
}
export async function readAssetJson(url) {
  const response = await fetch(assetUrl(url));
  if (!response.ok) throw new Error('Asset unavailable: ' + response.status);
  return resolveAssets(await response.json());
}

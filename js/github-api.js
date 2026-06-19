import {
  GITHUB_BRANCH,
  assertWorldCupFileMeta,
  githubContentsUrl
} from './github-config.js';

function encodeBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

export function githubAuthHeaders(token) {
  const auth = `Bearer ${token}`;
  if (!/^[\x00-\xFF]*$/.test(auth)) {
    throw new Error('GitHub Token มีอักขระไม่ถูกต้อง');
  }
  return {
    Accept: 'application/vnd.github+json',
    Authorization: auth,
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

export async function fetchGitHubJsonFile(filePath, token) {
  const url = `${githubContentsUrl(filePath)}?ref=${GITHUB_BRANCH}&t=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store', headers: githubAuthHeaders(token) });
  if (res.status === 404) return { data: null, sha: null };
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `อ่าน ${filePath} ล้มเหลว (${res.status})`);
  }
  const meta = await res.json();
  assertWorldCupFileMeta(meta);
  const json = JSON.parse(atob(meta.content.replace(/\n/g, '')));
  return { data: json, sha: meta.sha };
}

export async function putGitHubJsonFile(filePath, data, token, message) {
  const { sha } = await fetchGitHubJsonFile(filePath, token);
  const content = encodeBase64Utf8(JSON.stringify(data, null, 2));
  const res = await fetch(githubContentsUrl(filePath), {
    method: 'PUT',
    cache: 'no-store',
    headers: {
      ...githubAuthHeaders(token),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message,
      content,
      sha: sha || undefined,
      branch: GITHUB_BRANCH
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `บันทึก ${filePath} ล้มเหลว (${res.status})`);
  }
  return res.json();
}
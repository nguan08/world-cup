/** GitHub API — scoped to world-cup data + room files */

export const GITHUB_REPO_OWNER = 'nguan08';
export const GITHUB_REPO_NAME = 'world-cup';
export const GITHUB_REPO_FULL = `${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`;
export const GITHUB_DATA_FILE = 'data.json';
export const GITHUB_PUSH_SUBS_FILE = 'push-subscriptions.json';
export const GITHUB_ROOMS_INDEX_FILE = 'rooms/index.json';
export const GITHUB_BRANCH = 'main';

const STATIC_ALLOWED = new Set([
  GITHUB_DATA_FILE,
  GITHUB_PUSH_SUBS_FILE,
  GITHUB_ROOMS_INDEX_FILE
]);

export function isAllowedGitHubPath(filePath) {
  if (STATIC_ALLOWED.has(filePath)) return true;
  return /^rooms\/[a-z0-9][a-z0-9-]{0,30}[a-z0-9]\.json$/.test(filePath)
    || /^rooms\/[a-z0-9]{3,32}\.json$/.test(filePath);
}

export function githubRepoApiUrl(suffix = '') {
  const clean = String(suffix).replace(/^\//, '');
  return `https://api.github.com/repos/${GITHUB_REPO_FULL}${clean ? `/${clean}` : ''}`;
}

export function githubContentsUrl(filePath = GITHUB_DATA_FILE) {
  if (!isAllowedGitHubPath(filePath)) {
    throw new Error(`อนุญาตเฉพาะ data.json, push-subscriptions.json และ rooms/*.json ใน repo world-cup`);
  }
  return `${githubRepoApiUrl('contents')}/${filePath}`;
}

/** Raw file URL — updates faster than GitHub Pages after API commits. */
export function githubRawUrl(filePath) {
  if (!isAllowedGitHubPath(filePath)) {
    throw new Error(`อนุญาตเฉพาะ data.json, push-subscriptions.json และ rooms/*.json ใน repo world-cup`);
  }
  return `https://raw.githubusercontent.com/${GITHUB_REPO_FULL}/${GITHUB_BRANCH}/${filePath}`;
}

export function assertWorldCupFileMeta(meta) {
  if (!meta) throw new Error('ไม่พบข้อมูลไฟล์จาก GitHub');
  const path = meta.path || meta.name || '';
  if (!isAllowedGitHubPath(path)) {
    throw new Error(`ปฏิเสธ: path ไม่ได้รับอนุญาตใน ${GITHUB_REPO_NAME}`);
  }
}

export function assertWorldCupRepo(repo) {
  if (!repo) throw new Error('ไม่สามารถเข้าถึง repo world-cup ได้');
  const fullName = repo.full_name || `${repo.owner?.login}/${repo.name}`;
  if (fullName !== GITHUB_REPO_FULL) {
    throw new Error(`ปฏิเสธ: token ใช้ได้เฉพาะ repo ${GITHUB_REPO_FULL}`);
  }
}
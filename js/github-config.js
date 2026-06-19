/** GitHub API — scoped strictly to nguan08/world-cup data.json only */

export const GITHUB_REPO_OWNER = 'nguan08';
export const GITHUB_REPO_NAME = 'world-cup';
export const GITHUB_REPO_FULL = `${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`;
export const GITHUB_DATA_FILE = 'data.json';
export const GITHUB_PUSH_SUBS_FILE = 'push-subscriptions.json';
export const GITHUB_BRANCH = 'main';

const ALLOWED_PATHS = new Set([GITHUB_DATA_FILE, GITHUB_PUSH_SUBS_FILE]);

export function githubRepoApiUrl(suffix = '') {
  const clean = String(suffix).replace(/^\//, '');
  return `https://api.github.com/repos/${GITHUB_REPO_FULL}${clean ? `/${clean}` : ''}`;
}

export function githubContentsUrl(filePath = GITHUB_DATA_FILE) {
  if (!ALLOWED_PATHS.has(filePath)) {
    throw new Error(`อนุญาตเฉพาะไฟล์ data.json / push-subscriptions.json ใน repo world-cup`);
  }
  return `${githubRepoApiUrl('contents')}/${filePath}`;
}

export function assertWorldCupFileMeta(meta) {
  if (!meta) throw new Error('ไม่พบข้อมูลไฟล์จาก GitHub');
  const path = meta.path || meta.name || '';
  if (!ALLOWED_PATHS.has(path)) {
    throw new Error(`ปฏิเสธ: อนุญาตเฉพาะ data.json / push-subscriptions.json ใน ${GITHUB_REPO_NAME}`);
  }
}

export function assertWorldCupRepo(repo) {
  if (!repo) throw new Error('ไม่สามารถเข้าถึง repo world-cup ได้');
  const fullName = repo.full_name || `${repo.owner?.login}/${repo.name}`;
  if (fullName !== GITHUB_REPO_FULL) {
    throw new Error(`ปฏิเสธ: token ใช้ได้เฉพาะ repo ${GITHUB_REPO_FULL}`);
  }
}
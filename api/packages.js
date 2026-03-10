const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'imperialinteractive/steph-hq';
const FILE_PATH = 'packages-data.json';
const BRANCH = 'main';
const API_BASE = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;

async function getFile() {
  const res = await fetch(API_BASE + `?ref=${BRANCH}&t=${Date.now()}`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (res.status === 404) return { content: { active: [], arrived: [] }, sha: null };
  const data = await res.json();
  const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
  return { content, sha: data.sha };
}

async function putFile(content, sha) {
  const body = { message: 'Update packages', content: Buffer.from(JSON.stringify(content)).toString('base64'), branch: BRANCH };
  if (sha) body.sha = sha;
  await fetch(API_BASE, {
    method: 'PUT',
    headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = req.headers['x-lumen-key'] || req.query.key || '';
  if (auth.trim() !== 'lumen-steph-2026') return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const { content } = await getFile();
    return res.status(200).json(content);
  }

  if (req.method === 'POST') {
    const { content, sha } = await getFile();
    const { action, item } = req.body;
    if (action === 'add') {
      item.id = item.id || Date.now();
      content.active = content.active || [];
      content.active.unshift(item);
    } else if (action === 'arrived') {
      const idx = (content.active || []).findIndex(x => x.id === item.id);
      if (idx !== -1) {
        const [moved] = content.active.splice(idx, 1);
        content.arrived = content.arrived || [];
        content.arrived.unshift(moved);
      }
    } else if (action === 'edit') {
      const pkg = (content.active || []).find(x => x.id === item.id);
      if (pkg) { pkg.text = item.text; pkg.url = item.url; }
    } else if (action === 'delete') {
      content.active = (content.active || []).filter(x => x.id !== item.id);
    } else if (action === 'clear-arrived') {
      content.arrived = [];
    }
    await putFile(content, sha);
    return res.status(200).json({ ok: true, content });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

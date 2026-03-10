// Unified API for user-customized data: wellness goals, selfcare, longterm goals
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'imperialinteractive/steph-hq';
const FILE_PATH = 'userdata.json';
const BRANCH = 'main';
const API_BASE = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;

async function getFile() {
  const res = await fetch(API_BASE + `?ref=${BRANCH}&t=${Date.now()}`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (res.status === 404) return { content: {}, sha: null };
  const data = await res.json();
  const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
  return { content, sha: data.sha };
}

async function putFile(content, sha) {
  const body = { message: 'Update userdata', content: Buffer.from(JSON.stringify(content)).toString('base64'), branch: BRANCH };
  if (sha) body.sha = sha;
  await fetch(API_BASE, {
    method: 'PUT',
    headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
    const { key, data } = req.body;
    if (!key) return res.status(400).json({ error: 'Missing key' });
    content[key] = data;
    await putFile(content, sha);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

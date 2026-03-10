// Vercel serverless function — reads/writes Hayes Solid Starts data to GitHub
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'imperialinteractive/steph-hq';
const FILE_PATH = 'solids-data.json';
const BRANCH = 'main';
const API_BASE = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;

async function getFile() {
  const res = await fetch(API_BASE + `?ref=${BRANCH}&t=${Date.now()}`, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  if (res.status === 404) return { content: { currentDay: 1, foodsTried: ['Avocado','Yogurt (Dairy)'], allergens: ['Dairy'], notes: [] }, sha: null };
  const data = await res.json();
  const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
  return { content, sha: data.sha };
}

async function putFile(content, sha) {
  const body = {
    message: 'Update solids data',
    content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;
  const res = await fetch(API_BASE, {
    method: 'PUT',
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-lumen-key');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = req.headers['x-lumen-key'] || req.query.key || '';
  const expected = process.env.LUMEN_KEY || 'lumen-steph-2026';
  if (auth.trim() !== expected.trim()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    const { content } = await getFile();
    return res.status(200).json(content);
  }

  if (req.method === 'PUT') {
    // Full replace of solids data (from app)
    const { content: existing, sha } = await getFile();
    const updated = { ...existing, ...req.body };
    await putFile(updated, sha);
    return res.status(200).json({ ok: true, data: updated });
  }

  if (req.method === 'POST') {
    // Patch specific fields (from Lumen)
    const { content, sha } = await getFile();
    const patch = req.body;
    if (patch.addFood) {
      content.foodsTried = content.foodsTried || [];
      if (!content.foodsTried.includes(patch.addFood)) content.foodsTried.push(patch.addFood);
    }
    if (patch.addAllergen) {
      content.allergens = content.allergens || [];
      if (!content.allergens.includes(patch.addAllergen)) content.allergens.push(patch.addAllergen);
    }
    if (patch.addNote) {
      content.notes = content.notes || [];
      content.notes.unshift({ text: patch.addNote, date: patch.date || new Date().toISOString().slice(0,10) });
    }
    if (patch.currentDay !== undefined) content.currentDay = patch.currentDay;
    await putFile(content, sha);
    return res.status(200).json({ ok: true, data: content });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

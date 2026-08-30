import { getDriveAccessToken } from '../lib/secureDownload.js';

const SAMPLE_FILE_ID = '1qZ1rwoX-1qeYkUllknuEsltBbV8dTzHx';
const SAMPLE_FILE_NAME = 'Vol_Surface_Playbook_7_Page_Sample.pdf';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'HEAD'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!clientEmail || !privateKey) {
    return res.status(500).json({ error: 'Sample preview storage is not configured' });
  }

  try {
    const token = await getDriveAccessToken(clientEmail, privateKey);
    const driveResp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${SAMPLE_FILE_ID}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!driveResp.ok) {
      const detail = await driveResp.text();
      console.error('vol-surface-sample Drive fetch failed:', detail);
      return res.status(502).json({ error: 'Could not fetch sample preview' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${SAMPLE_FILE_NAME}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    const contentLength = driveResp.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    if (req.method === 'HEAD') return res.status(200).end();

    const reader = driveResp.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    return res.end();
  } catch (err) {
    console.error('vol-surface-sample proxy error:', err.message);
    return res.status(500).json({ error: 'Could not load sample preview' });
  }
}

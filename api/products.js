import { getDriveAccessToken } from '../lib/secureDownload.js';

const FILE_ID = '1itNtXZgsT4PaYLj-Id4v_mqpZ3yPRSKm';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!clientEmail || !privateKey) {
    return res.status(500).json({ ok: false, error: 'Drive credentials not configured in this environment' });
  }
  try {
    const token = await getDriveAccessToken(clientEmail, privateKey);
    const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${FILE_ID}?fields=id,name,mimeType,size,capabilities(canEdit,canDownload,canShare),permissions(role,emailAddress),copyRequiresWriterPermission`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await resp.json();
    if (!resp.ok) return res.status(resp.status).json({ ok: false, status: resp.status, error: body?.error?.message || 'Drive lookup failed' });
    const saPermission = (body.permissions || []).find(p => p.emailAddress === clientEmail);
    return res.status(200).json({
      ok: true,
      fileId: body.id,
      name: body.name,
      mimeType: body.mimeType,
      size: body.size || null,
      serviceAccountRole: saPermission?.role || null,
      canEdit: !!body.capabilities?.canEdit,
      canDownload: !!body.capabilities?.canDownload,
      canShare: !!body.capabilities?.canShare,
      copyRequiresWriterPermission: !!body.copyRequiresWriterPermission
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}

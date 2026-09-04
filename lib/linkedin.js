export async function handleLinkedInOAuth(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');

    // 1. Handle OAuth Callback from LinkedIn
    const code = req.query?.code;
    const error = req.query.error;
    const errorDesc = req.query.error_description;

    if (error) {
        return res.status(400).send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8">
                <title>LinkedIn Authorization Failed - Desk2Quant</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0e1a; color: #f1f5f9; padding: 40px 20px; text-align: center; }
                    .card { max-width: 540px; margin: 0 auto; background: #131b2e; border: 1px solid #ef4444; border-radius: 16px; padding: 32px; }
                    h1 { color: #ef4444; font-size: 22px; margin-bottom: 12px; }
                    p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
                    code { background: #0a0e1a; padding: 3px 6px; border-radius: 4px; color: #f87171; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>❌ LinkedIn Authorization Denied</h1>
                    <p>Error: <code>${error}</code></p>
                    <p>${errorDesc || 'Please ensure you added the <strong>Share on LinkedIn</strong> product in your LinkedIn Developer App.'}</p>
                    <p><a href="/" style="color:#60a5fa;">Return to Desk2Quant</a></p>
                </div>
            </body>
            </html>
        `);
    }

    if (code) {
        // Exchange code for access token
        const clientId = process.env.LINKEDIN_CLIENT_ID || '7783myta62ckmf';
        const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
        const redirectUri = process.env.LINKEDIN_REDIRECT_URI || 'https://desk2quant.com/api/auth/linkedin/callback';

        if (!clientSecret) {
            return res.status(500).send('Server Error: LINKEDIN_CLIENT_SECRET environment variable is missing.');
        }

        try {
            const tokenParams = new URLSearchParams({
                grant_type: 'authorization_code',
                code: String(code).trim(),
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri
            });

            const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: tokenParams.toString()
            });

            const tokenData = await tokenRes.json();
            if (!tokenRes.ok || !tokenData.access_token) {
                return res.status(tokenRes.status).send(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head><style>body{font-family:sans-serif;padding:40px;background:#0a0e1a;color:#fff;text-align:center;}</style></head>
                    <body>
                        <h1 style="color:#ef4444;">❌ Token Exchange Failed (${tokenRes.status})</h1>
                        <pre style="background:#161b22;padding:20px;border-radius:8px;display:inline-block;text-align:left;max-width:90%;overflow-x:auto;">${JSON.stringify(tokenData, null, 2)}</pre>
                        <p><a href="/" style="color:#60a5fa;">Return to Desk2Quant</a></p>
                    </body></html>
                `);
            }

            // Fetch profile info via OpenID userinfo
            let userName = 'Amit Kumar Jha';
            let userEmail = 'akjha002';
            let userSub = '';

            try {
                const userRes = await fetch('https://api.linkedin.com/v2/userinfo', {
                    headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
                });
                if (userRes.ok) {
                    const user = await userRes.json();
                    userName = user.name || `${user.given_name || ''} ${user.family_name || ''}`.trim() || userName;
                    userEmail = user.email || userEmail;
                    userSub = user.sub || '';
                }
            } catch (_) {}

            return res.status(200).send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="utf-8">
                    <title>LinkedIn Connected - Desk2Quant</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0e1a; color: #f1f5f9; padding: 40px 20px; text-align: center; }
                        .card { max-width: 520px; margin: 40px auto; background: #131b2e; border: 1px solid #23304d; border-radius: 16px; padding: 36px 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
                        .badge { display: inline-block; background: #10b981; color: #fff; font-weight: 700; padding: 6px 14px; border-radius: 99px; font-size: 13px; margin-bottom: 16px; }
                        h1 { font-size: 24px; margin: 0 0 12px 0; }
                        p { color: #94a3b8; font-size: 14.5px; line-height: 1.6; margin: 8px 0; }
                        .info-box { background: #0a0e1a; border: 1px solid #1e293b; padding: 14px; border-radius: 10px; font-family: monospace; font-size: 13px; word-break: break-all; margin: 20px 0; color: #38bdf8; text-align: left; }
                        .btn { display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 14px; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <span class="badge">Connected</span>
                        <h1>LinkedIn Connected Successfully!</h1>
                        <p>Welcome, <strong>${userName}</strong> (${userEmail}).</p>
                        <p>Your Desk2Quant LinkedIn posting permissions are now active for the next 60 days.</p>
                        <div class="info-box">
                            <div><strong>Author:</strong> ${userName}</div>
                            <div><strong>Person URN:</strong> urn:li:person:${userSub}</div>
                            <div style="margin-top:10px;margin-bottom:4px;"><strong>Access Token:</strong></div>
                            <div style="display:flex;gap:8px;">
                                <input id="tokenInput" type="password" value="${tokenData.access_token}" readonly style="flex:1;background:#060911;border:1px solid #334155;color:#38bdf8;padding:8px 10px;border-radius:6px;font-family:monospace;font-size:12px;">
                                <button id="toggleBtn" onclick="const el=document.getElementById('tokenInput');if(el.type==='password'){el.type='text';this.textContent='Hide';}else{el.type='password';this.textContent='Show';}" style="background:#334155;color:#fff;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;font-size:12px;">Show</button>
                                <button id="copyBtn" onclick="navigator.clipboard.writeText('${tokenData.access_token}');this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',2000);" style="background:#2563eb;color:#fff;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Copy</button>
                            </div>
                            <p style="margin-top:10px;font-size:12px;color:#94a3b8;">You can paste this token into <code>.env.local</code> as <code>LINKEDIN_ACCESS_TOKEN</code>.</p>
                        </div>
                        <a href="/" class="btn">Return to Desk2Quant &rarr;</a>
                    </div>
                </body>
                </html>
            `);
        } catch (err) {
            return res.status(500).send(`Server error during LinkedIn exchange: ${err.message}`);
        }
    }

    // 3. Default: redirect browser to LinkedIn OAuth authorization screen
    const clientId = process.env.LINKEDIN_CLIENT_ID || '7783myta62ckmf';
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI || 'https://desk2quant.com/api/auth/linkedin/callback';
    const scopes = ['w_member_social', 'openid', 'profile', 'email'];
    const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes.join(' '))}&state=d2q_${Date.now()}`;

    res.writeHead(302, { Location: authUrl });
    res.end();
}

export async function getUserProfile(token) {
    const res = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to fetch LinkedIn profile (${res.status}): ${text}`);
    }
    return await res.json();
}

export async function publishPost(text, url, token, urn) {
    const accessToken = token || process.env.LINKEDIN_ACCESS_TOKEN;
    if (!accessToken) {
        throw new Error('LINKEDIN_ACCESS_TOKEN is not configured.');
    }

    let personUrn = urn || process.env.LINKEDIN_PERSON_URN;
    if (!personUrn) {
        const profile = await getUserProfile(accessToken);
        personUrn = `urn:li:person:${profile.sub}`;
    }

    const payload = {
        author: personUrn,
        commentary: text,
        visibility: 'PUBLIC',
        distribution: {
            feedDistribution: 'MAIN_FEED',
            targetEntities: [],
            thirdPartyDistributionChannels: []
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false
    };

    if (url) {
        payload.content = {
            article: {
                source: url,
                title: 'Desk2Quant Quant Finance Resource',
                description: 'Practitioner-grade quant finance material, code, and interview preparation.'
            }
        };
    }

    const res = await fetch('https://api.linkedin.com/rest/posts', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Linkedin-Version': '202401',
            'X-Restli-Protocol-Version': '2.0.0',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (res.status === 201) {
        const postUrn = res.headers.get('x-restli-id') || res.headers.get('x-linkedin-id') || 'Created';
        return { success: true, postUrn };
    }

    const errBody = await res.text();
    throw new Error(`LinkedIn post failed (${res.status}): ${errBody}`);
}

export default handleLinkedInOAuth;


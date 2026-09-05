import fs from 'node:fs';

const POST_URL = 'https://www.linkedin.com/posts/akjha002_the-5-projects-that-actually-get-you-hired-activity-7501853372996775936-GP0g';
const POST_URN = 'urn:li:ugcPost:7501853371901952000';

async function checkPost() {
    console.log('=== Desk2Quant LinkedIn Post Monitor ===');
    console.log(`Checking post: ${POST_URL}`);

    // 1. Fetch public post metadata
    try {
        const res = await fetch(POST_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!res.ok) {
            console.log(`⚠️ Post HTTP Status: ${res.status}`);
            return;
        }

        const html = await res.text();
        const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);

        if (match) {
            const data = JSON.parse(match[1]);
            const publishedAt = new Date(data.datePublished);
            const now = new Date();
            const elapsedMinutes = Math.round((now - publishedAt) / 60000);

            console.log(`\n📅 Published At: ${data.datePublished} (${elapsedMinutes} minutes ago)`);
            console.log(`👤 Author: ${data.author?.name} (${data.author?.interactionStatistic?.userInteractionCount || 0} followers)`);
            console.log(`📄 Title: ${data.text || data.headline}`);

            const stats = Array.isArray(data.interactionStatistic) ? data.interactionStatistic : [];
            let likes = 0;
            let comments = data.commentCount || 0;

            stats.forEach(s => {
                if (s.interactionType?.includes('LikeAction')) likes = s.userInteractionCount;
                if (s.interactionType?.includes('CommentAction')) comments = s.userInteractionCount;
            });

            console.log('\n📊 Engagement Metrics:');
            console.log(`  • Reactions/Likes: ${likes}`);
            console.log(`  • Comments:        ${comments}`);

            // Velocity health check
            console.log('\n📈 Health Assessment:');
            if (elapsedMinutes < 45) {
                console.log('  • Status: EARLY GOLDEN HOUR (< 45m). Feeds are indexing the post.');
            } else if (likes > 10 || comments > 2) {
                console.log('  • Status: TRACTION GAINED. Algorithm is expanding to 2nd-degree feeds.');
            } else {
                console.log('  • Status: SLOW VELOCITY. First-hour engagement is low; monitor closely.');
            }
        } else {
            console.log('Could not extract JSON-LD engagement block.');
        }
    } catch (err) {
        console.error('Error checking LinkedIn post:', err.message);
    }

    // 2. Check Supabase Funnel Events
    try {
        const envPath = '.env.local';
        if (fs.existsSync(envPath)) {
            const dotenv = fs.readFileSync(envPath, 'utf8');
            const env = {};
            dotenv.split('\n').forEach(l => {
                const i = l.indexOf('=');
                if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '');
            });

            const url = env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
            const key = env.SUPABASE_SERVICE_ROLE_KEY;

            if (key) {
                const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
                const funnelRes = await fetch(`${url}/rest/v1/funnel_events?created_at=gte.${oneHourAgo}&order=created_at.desc&limit=20`, {
                    headers: { apikey: key, Authorization: `Bearer ${key}` }
                });
                if (funnelRes.ok) {
                    const events = await funnelRes.json();
                    console.log(`\n🌐 Desk2Quant Traffic (Last 60m): ${events.length} tracked events.`);
                }
            }
        }
    } catch (e) {
        // quiet
    }
}

checkPost();

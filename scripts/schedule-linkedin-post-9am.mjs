import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deletePost, publishDocumentPost, publishComment } from './linkedin.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Target time: 9:00 AM IST = 03:30:00 UTC on September 5, 2026
const TARGET_TIME = new Date('2026-09-05T03:30:00.000Z');
const OLD_POST_URN = 'urn:li:ugcPost:7501674434798346241';
const PDF_PATH = path.join(ROOT, 'assets', 'downloads', 'quant-projects-blueprint-carousel.pdf');
const TITLE = 'The 5 Projects That Actually Get You Hired As A Quant in 2026';

const CAPTION_TEXT = `Every STEM applicant has a high GPA, an advanced degree, and knows Black-Scholes.

So why do 95% of resumes get filtered out before the first technical round at Citadel, Jane Street, Millennium, and Optiver?

Because interviewers do not hire candidates who only know how to solve textbook exercises. They hire candidates who have built production-grade systems on their GitHub.

If your GitHub only has a naive moving average backtest using yfinance or a standard Black-Scholes calculator, recruiters move on in 5 seconds.

Here is a 6-slide architecture breakdown of the 5 projects that actually prove desk readiness in 2026:

1. L2 Limit Order Book & Matching Engine (C++20)
Price-time priority, lock-free SPSC ring buffers, probabilistic queue position depletion, and microsecond wire-to-wire latency modeling.

2. Arbitrage-Free SVI Volatility Surface (Python + C++)
Gatheral SSVI parameterization, calendar/butterfly static arbitrage checks (Breeden-Litzenberger), and Dupire local vol PDE inversion.

3. Cointegration & Kalman Filter Stat Arb (Python)
Augmented Dickey-Fuller / Johansen rank, dynamic state-space beta tracking, Ornstein-Uhlenbeck half-life calibration, and square-root market impact.

4. Multi-Curve SOFR Discounting Engine (C++)
Modern post-LIBOR dual-curve bootstrapping, OIS discounting, and monotone convex spline interpolation.

5. XVA & Counterparty Risk Simulation (C++)
American Monte Carlo (Longstaff-Schwartz) across 10,000 paths, Expected Exposure (EE), 99% PFE, and CSA netting sets.

Swipe through the 6 slides below for the system architecture diagrams, amateur pitfalls, and interview defense questions.

(Access to all 45 production-grade project blueprints with code, derivations, and CV bullets is linked in Comment #1 below)`;

const COMMENT_TEXT = `Discussion prompt for quants and developers: When building a personal portfolio, which project taught you the most about real desk execution—microstructure matching engines or multi-asset volatility calibration?

The complete blueprint covering all 45 industry-grade projects (mathematical derivations, Python prototypes, production C++ code, interview defense questions, and resume bullets) is available on Desk2Quant:
https://desk2quant.com/products/ultimate-industry-grade-quant-project-pack-45-projects.html

(Use coupon code PROJECT20 at checkout for 20% off)`;

async function updateMonitorScript(newUrn, activityUrl) {
    const monitorPath = path.join(ROOT, 'scripts', 'check-linkedin-post-analytics.mjs');
    if (!fs.existsSync(monitorPath)) return;
    let content = fs.readFileSync(monitorPath, 'utf8');
    content = content.replace(/const POST_URL = '.*?';/, `const POST_URL = '${activityUrl}';`);
    content = content.replace(/const POST_URN = '.*?';/, `const POST_URN = '${newUrn}';`);
    fs.writeFileSync(monitorPath, content, 'utf8');
    console.log('✅ check-linkedin-post-analytics.mjs updated with new URN and URL.');
}

async function executePublish() {
    console.log('\n======================================================');
    console.log(`⏰ Target Time Reached (9:00 AM IST / 03:30 UTC)!`);
    console.log('Starting automated LinkedIn morning launch sequence...');
    console.log('Product: Ultimate Industry Grade Quant Project Pack (45 Projects)');
    console.log('======================================================\n');

    // 1. Delete stagnant post
    try {
        console.log(`1. Deleting previous post (${OLD_POST_URN})...`);
        await deletePost(OLD_POST_URN);
        console.log('✅ Old post deleted successfully.');
    } catch (err) {
        console.warn('⚠️ Note on deletion (may have already been removed):', err.message);
    }

    // Small breather
    await new Promise(r => setTimeout(r, 2000));

    // 2. Publish document carousel
    console.log(`\n2. Uploading and publishing 6-slide carousel: ${PDF_PATH}...`);
    const publishRes = await publishDocumentPost(CAPTION_TEXT, PDF_PATH, TITLE);
    console.log('✅ Carousel post published successfully!');
    console.log(`Post URN:     ${publishRes.postUrn}`);
    console.log(`Document URN: ${publishRes.documentUrn}`);

    // Wait 4s for LinkedIn index
    console.log('\n3. Waiting 4 seconds for LinkedIn index propagation...');
    await new Promise(r => setTimeout(r, 4000));

    // 3. Publish Comment #1
    console.log('4. Publishing Comment #1 with 45 Projects link and PROJECT20 promo...');
    let commentRes = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            commentRes = await publishComment(publishRes.postUrn, COMMENT_TEXT);
            console.log(`✅ Comment #1 published successfully! Comment ID: ${commentRes.id}`);
            break;
        } catch (cErr) {
            console.warn(`Attempt ${attempt} comment publish failed: ${cErr.message}. Retrying in 3s...`);
            await new Promise(r => setTimeout(r, 3000));
        }
    }

    // 4. Resolve Activity URL and update monitor
    let activityUrl = `https://www.linkedin.com/feed/update/${publishRes.postUrn}/`;
    try {
        const checkRes = await fetch(activityUrl);
        const html = await checkRes.text();
        const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
        if (match) {
            const ld = JSON.parse(match[1]);
            if (ld['@id']) {
                activityUrl = ld['@id'];
                console.log(`Activity URL resolved: ${activityUrl}`);
            }
        }
    } catch (e) {
        // use default feed update url
    }

    await updateMonitorScript(publishRes.postUrn, activityUrl);

    console.log('\n🎉 ALL DONE! 9:00 AM IST Morning Launch Complete.');
    console.log(`Live Post: ${activityUrl}`);
}

async function main() {
    const isDryRun = process.argv.includes('--now');
    const now = Date.now();
    const delayMs = isDryRun ? 0 : TARGET_TIME.getTime() - now;

    console.log('=== Desk2Quant 9:00 AM IST LinkedIn Scheduler ===');
    console.log(`Product:     Ultimate Industry Grade Quant Project Pack (45 Projects)`);
    console.log(`Current Time: ${new Date().toISOString()} (${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST)`);
    console.log(`Target Time:  ${TARGET_TIME.toISOString()} (09:00:00 AM IST)`);

    if (delayMs <= 0) {
        console.log('Target time reached or --now specified. Executing immediately...');
        await executePublish();
        return;
    }

    const minutesUntil = Math.round(delayMs / 60000);
    console.log(`⏳ Waiting ${minutesUntil} minutes until 9:00 AM IST...`);
    console.log('Scheduler is actively running in background.');

    // Print heartbeat every 15 minutes
    const interval = setInterval(() => {
        const rem = TARGET_TIME.getTime() - Date.now();
        if (rem <= 0) {
            clearInterval(interval);
        } else {
            console.log(`⏳ [${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST] ${Math.round(rem / 60000)} minutes remaining until 9:00 AM IST...`);
        }
    }, 15 * 60 * 1000);

    setTimeout(async () => {
        clearInterval(interval);
        try {
            await executePublish();
        } catch (err) {
            console.error('❌ Scheduler error during executePublish:', err);
            process.exit(1);
        }
    }, delayMs);
}

main().catch(err => {
    console.error('Fatal scheduler error:', err);
    process.exit(1);
});

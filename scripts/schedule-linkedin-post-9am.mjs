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
const PDF_PATH = path.join(ROOT, 'assets', 'downloads', 'quant-interview-desk-traps-carousel.pdf');
const TITLE = 'The 4 Questions That Break Math Ph.Ds In Quant Interviews';

const CAPTION_TEXT = `The gap between textbook stochastic calculus and desk engineering is where 90% of STEM candidates get dinged in buyside quant rounds (Citadel, Jane Street, Millennium, Optiver).

Their paper math is usually flawless. But when asked what happens to their continuous formulas under discrete sampling, latency, and queue priority, the models implode.

Here is a 6-slide practitioner breakdown of the 4 classic technical failure modes we repeatedly see:

1. SDE Discretization Bias (Why Euler-Maruyama produces negative asset prices on jumps, and why desks enforce Milstein / log-space transforms)
2. The "3.8 Sharpe" Backtest Illusion (Timestamp asynchrony, SIP latency, and adverse selection in queue priority)
3. Discrete Delta Hedging vs. Slippage (Why continuous rebalancing destroys P&L via market impact, and how Hodges-Neuberger bands fix it)
4. Multiple Testing Overfitting (Why an un-annualized 1.8 Sharpe from 3,000 noise trials is pure Gumbel extreme value theory, requiring Deflated Sharpe adjustments)

Swipe through the 6 slides below for the full mathematical derivations and desk fixes.

(Complete practitioner manual covering all 29 desk failure modes is linked in Comment #1 below)`;

const COMMENT_TEXT = `Discussion prompt for practitioners: When pricing exotic path-dependent options under jump-diffusions, what is your desk standard for discretization—do you use Milstein with truncation, or full quadratic-exponential (QE) schemes?

The complete practitioner manual covering all 29 desk failure modes, discrete hedging friction, and buyside interview simulations is available on Desk2Quant:
https://desk2quant.com/products/common-mistakes-in-quant-interviews-desk-fixes-edition.html

(Use code MISTAKES20 for 20% off)`;

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
    console.log('4. Publishing Comment #1 with manual link and promo code...');
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

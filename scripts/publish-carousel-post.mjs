import fs from 'node:fs';
import { publishDocumentPost } from './linkedin.mjs';

const text = fs.readFileSync('scripts/post_text.txt', 'utf8').trim();
const pdfPath = 'assets/downloads/quant-interview-desk-traps-carousel.pdf';
const title = 'The 4 Questions That Break Math Ph.Ds In Quant Interviews';

console.log('--- Publishing Sanitized Carousel Post to LinkedIn ---');
console.log(`Document: ${pdfPath}`);
console.log(`Document Title: ${title}`);
console.log(`Text Length: ${text.length} characters`);
console.log('First 100 chars:\n', text.slice(0, 100));
console.log('Last 100 chars:\n', text.slice(-100));
console.log('------------------------------------------------------');

try {
    const res = await publishDocumentPost(text, pdfPath, title);
    console.log('🎉 SUCCESS! Post is live on LinkedIn.');
    console.log(`Post URN: ${res.postUrn}`);
    console.log(`Document URN: ${res.documentUrn}`);
} catch (err) {
    console.error('❌ Failed to publish post:', err.message);
    process.exit(1);
}

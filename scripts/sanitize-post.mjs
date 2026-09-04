import fs from 'node:fs';

let text = fs.readFileSync('scripts/post_text.txt', 'utf8');
text = text.replace(/≈/g, '~');
text = text.replace(/’/g, "'");
text = text.replace(/‘/g, "'");
text = text.replace(/[“”]/g, '"');
fs.writeFileSync('scripts/post_text.txt', text, 'utf8');

let nonAsciiCount = 0;
for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 127) {
        console.log(`Non-ASCII at pos ${i}: "${text[i]}" (code: ${text.charCodeAt(i)})`);
        nonAsciiCount++;
    }
}
console.log(`Sanitization complete. Non-ASCII count: ${nonAsciiCount}. Total chars: ${text.length}`);

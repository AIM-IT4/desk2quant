const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const SUPABASE_URL = 'https://dntabmyurlrlnoajdnja.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRudGFibXl1cmxybG5vYWpkbmphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMDEyNjUsImV4cCI6MjA4NTY3NzI2NX0.PYpNd_t_px09zi2d5WGjFVOB23sjb3ZPuAnxagYshe0';
const ARTICLE_PATH = 'C:/Users/iitak/.gemini/antigravity/brain/54439cb6-7ff3-43f8-b28d-aff83e2f4f9a/article_heston_calibration.md';

// Base URL for resolving relative image paths
const SITE_BASE_URL = 'https://desk2quant.vercel.app';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function convertMarkdownToHtml(markdown) {
    let html = markdown;

    // Remove Title (Handled separately)
    const titleMatch = html.match(/^# (.*$)/m);
    let title = 'New Article';
    if (titleMatch) {
        title = titleMatch[1];
        html = html.replace(/^# .*$/m, '');
    }

    // ===== PHASE 1: Extract and protect special blocks =====
    const codeBlocks = [];
    const mathBlocks = [];
    const tableBlocks = [];

    // Extract fenced code blocks (```lang ... ```)
    // Handle both \n and \r\n line endings
    html = html.replace(/```(\w*)\r?\n([\s\S]*?)```/g, (match, lang, code) => {
        const idx = codeBlocks.length;
        const escapedCode = code
            .replace(/\r\n/g, '\n')  // Normalize line endings first
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        codeBlocks.push(
            `<pre style="background:#1a1a2e; color:#e0e0e0; padding:16px 20px; border-radius:8px; overflow-x:auto; font-family:'Fira Code',Consolas,monospace; font-size:0.88em; line-height:1.6; border-left:3px solid #8b5cf6; margin:15px 0; white-space:pre;">` +
            `<code class="language-${lang || 'text'}">${escapedCode}</code></pre>`
        );
        return `%%CODEBLOCK_${idx}%%`;
    });

    // Extract display math blocks ($$...$$)
    html = html.replace(/\$\$([\s\S]*?)\$\$/g, (match, math) => {
        const idx = mathBlocks.length;
        mathBlocks.push(`<div class="math-block" style="overflow-x:auto; margin:20px 0; text-align:center;">$$${math}$$</div>`);
        return `%%MATHBLOCK_${idx}%%`;
    });

    // Extract markdown tables (handle both \n and \r\n)
    html = html.replace(/(\|[^\r\n]+\|\r?\n\|[-\s|:\r]+\|\r?\n(?:\|[^\r\n]+\|\r?\n?)*)/g, (match) => {
        const idx = tableBlocks.length;
        const rows = match.trim().split(/\r?\n/);
        let tableHtml = '<table style="width:100%; border-collapse:collapse; margin:20px 0; font-size:0.92em;">';

        rows.forEach((row, rowIdx) => {
            if (rowIdx === 1) return; // Skip separator row
            const cells = row.split('|').filter(c => c.trim() !== '');
            const tag = rowIdx === 0 ? 'th' : 'td';
            const bgStyle = rowIdx === 0
                ? 'background:rgba(139,92,246,0.15); font-weight:600;'
                : (rowIdx % 2 === 0 ? 'background:rgba(255,255,255,0.02);' : '');
            tableHtml += '<tr>';
            cells.forEach(cell => {
                tableHtml += `<${tag} style="padding:10px 14px; border:1px solid rgba(255,255,255,0.1); ${bgStyle}">${cell.trim()}</${tag}>`;
            });
            tableHtml += '</tr>';
        });

        tableHtml += '</table>';
        tableBlocks.push(tableHtml);
        return `%%TABLEBLOCK_${idx}%%`;
    });

    // ===== PHASE 2: Inline formatting =====

    // Images: ![alt](url) → <img> with proper URL resolution
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
        const resolvedSrc = src.startsWith('http') ? src : `${SITE_BASE_URL}/${src}`;
        return `<div style="margin:25px 0; text-align:center;"><img src="${resolvedSrc}" alt="${alt}" style="max-width:100%; border-radius:10px; box-shadow:0 4px 20px rgba(0,0,0,0.4);"><p style="color:#9ca3af; font-size:0.85em; margin-top:8px; font-style:italic;">${alt}</p></div>`;
    });

    // Headers
    html = html.replace(/^### (.*$)/gm, '<h3 style="margin-top:35px; color:#a5b4fc;">$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2 style="margin-top:40px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px;">$1</h2>');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Inline code (single backticks) — but not inside code blocks
    html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(139,92,246,0.15); color:#c4b5fd; padding:2px 6px; border-radius:4px; font-family:\'Fira Code\',Consolas,monospace; font-size:0.9em;">$1</code>');

    // Inline math ($...$) — preserve for MathJax (don't transform)
    // MathJax processes these directly, so we leave $...$ as-is

    // ===== PHASE 3: Paragraphs =====
    let paragraphs = html.split(/\n\s*\n/);
    paragraphs = paragraphs.filter(p => p.trim() !== '');

    const processedParagraphs = paragraphs.map(p => {
        p = p.trim();
        if (p.startsWith('<h')) return p;
        if (p.startsWith('<div')) return p;
        if (p.startsWith('<table')) return p;
        if (p.startsWith('<pre')) return p;
        if (p.startsWith('%%')) return p; // Protected block placeholder
        return `<p style="line-height:1.8; margin-bottom:16px;">${p}</p>`;
    });

    html = processedParagraphs.join('\n');

    // ===== PHASE 4: Restore protected blocks =====
    codeBlocks.forEach((block, idx) => {
        html = html.replace(`%%CODEBLOCK_${idx}%%`, block);
    });
    mathBlocks.forEach((block, idx) => {
        html = html.replace(`%%MATHBLOCK_${idx}%%`, block);
    });
    tableBlocks.forEach((block, idx) => {
        html = html.replace(`%%TABLEBLOCK_${idx}%%`, block);
    });

    return { title, content: html };
}

async function publishBlog() {
    console.log('🚀 Reading article from:', ARTICLE_PATH);

    try {
        const markdown = fs.readFileSync(ARTICLE_PATH, 'utf8');
        const { title, content } = convertMarkdownToHtml(markdown);

        console.log(`📝 Parsed Article: "${title}"`);
        console.log(`📊 Content length: ${content.length} characters`);

        // Excerpt (First paragraph plain text)
        const excerptMatch = content.match(/<p[^>]*>(.*?)<\/p>/);
        let excerpt = excerptMatch ? excerptMatch[1].replace(/<[^>]*>/g, '').substring(0, 200) + '...' : 'A deep dive into Quant finance.';

        // Generate Slug
        const slug = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        const payload = {
            title: title,
            slug: slug,
            content: content,
            excerpt: excerpt,
            cover_image_url: `${SITE_BASE_URL}/assets/images/blog-heston-cover.png`,
            is_published: true,
            created_at: new Date().toISOString()
        };

        console.log('📤 Uploading to Supabase...');
        console.log(`   Title: ${payload.title}`);
        console.log(`   Slug: ${payload.slug}`);
        console.log(`   Excerpt: ${payload.excerpt.substring(0, 80)}...`);
        console.log(`   Cover: ${payload.cover_image_url}`);

        const { data, error } = await supabase
            .from('blogs')
            .insert([payload])
            .select();

        if (error) {
            console.error('❌ Error publishing blog:', error.message);
        } else {
            console.log('✅ Blog published successfully!');
            console.log('🆔 ID:', data[0].id);
            console.log('🔗 Title:', data[0].title);
            console.log('📅 Created:', data[0].created_at);
        }

    } catch (err) {
        console.error('❌ Failed to read or process file:', err);
    }
}

publishBlog();

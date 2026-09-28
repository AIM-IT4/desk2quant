export function assertHomepageHeading(html) {
    const markup = html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
    const match = markup.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    if (!match) throw new Error('homepage has no H1');

    const heading = match[1]
        .replace(/<br\b[^>]*>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;|&#160;|&#x0*a0;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Check the page's topic without tying monitoring to exact marketing copy.
    if (![/\bquant\b/i, /\binterview\b/i, /\bdesk\b/i].every((topic) => topic.test(heading))) {
        throw new Error(`homepage H1 must cover quant, interview, and desk topics; received ${JSON.stringify(heading)}`);
    }
    return heading;
}

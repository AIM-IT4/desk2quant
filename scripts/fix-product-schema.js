const fs = require('fs');
const path = require('path');

// Target HTML files in the project
const TARGET_FILES = [
    path.join(__dirname, '..', 'index.html'),
    path.join(__dirname, '..', 'index-test.html'),
    path.join(__dirname, '..', 'quant-mentor', 'index.html'),
    path.join(__dirname, '..', 'quant-mentor', 'index-test.html')
];

function enrichStructuredData(htmlContent, filePath) {
    // Regular expression to match <script type="application/ld+json">...</script>
    const ldJsonRegex = /<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;

    let modified = false;
    const newHtmlContent = htmlContent.replace(ldJsonRegex, (match, jsonText) => {
        try {
            const data = JSON.parse(jsonText.trim());

            // Check if this is our target ItemList product catalog schema
            if (data && data['@type'] === 'ItemList' && Array.isArray(data.itemListElement)) {
                console.log(`✨ Processing Product ItemList schema in ${path.basename(filePath)}...`);

                data.itemListElement = data.itemListElement.map((item, idx) => {
                    if (item.item && item.item['@type'] === 'Product') {
                        const product = item.item;

                        // 1. Add Brand
                        product.brand = {
                            '@type': 'Brand',
                            'name': 'Desk2Quant'
                        };

                        // 2. Add product image (using brand logo as fallback since dynamic CSS styles are used on site)
                        product.image = 'https://desk2quant.com/assets/images/desk2quant-mark.svg?v=1';

                        // 3. Enrich Offers
                        if (product.offers) {
                            const oldOffers = Array.isArray(product.offers) ? product.offers : [product.offers];
                            const enrichedOffers = oldOffers.map(offer => {
                                if (offer['@type'] === 'Offer') {
                                    return {
                                        ...offer,
                                        'priceValidUntil': '2027-12-31',
                                        'availability': 'https://schema.org/InStock',
                                        'hasMerchantReturnPolicy': {
                                            '@type': 'MerchantReturnPolicy',
                                            'applicableCountry': 'IN',
                                            'returnPolicyCategory': 'https://schema.org/MerchantReturnPolicyNoReturns'
                                        }
                                    };
                                }
                                return offer;
                            });

                            product.offers = enrichedOffers.length === 1 ? enrichedOffers[0] : enrichedOffers;
                        }
                    }
                    return item;
                });

                modified = true;
                // Format the JSON block with same indentation
                return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n</script>`;
            }
        } catch (e) {
            // Ignore non-JSON parsing blocks, or other unrelated ones
            // console.warn('Non-parseable JSON-LD block matched:', e.message);
        }
        return match;
    });

    return { content: newHtmlContent, modified };
}

function main() {
    let successCount = 0;
    TARGET_FILES.forEach(filePath => {
        if (!fs.existsSync(filePath)) {
            console.warn(`⚠️ Target file does not exist: ${filePath}`);
            return;
        }

        try {
            const originalContent = fs.readFileSync(filePath, 'utf8');
            const { content, modified } = enrichStructuredData(originalContent, filePath);

            if (modified) {
                fs.writeFileSync(filePath, content, 'utf8');
                console.log(`✅ Successfully updated schema in: ${filePath}`);
                successCount++;
            } else {
                console.warn(`❓ Found no matchable ItemList schema block inside: ${filePath}`);
            }
        } catch (err) {
            console.error(`❌ Failed to process: ${filePath}`, err);
        }
    });

    console.log(`🎉 Done. Updated ${successCount}/${TARGET_FILES.length} files.`);
}

main();

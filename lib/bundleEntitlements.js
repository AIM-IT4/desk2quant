// Entitlements that are included only for NEW purchases of the expanded
// Complete Front Office & Risk Quant Professional Bundle.
// Legacy bundle buyers keep their existing Drive-folder permission only.
export const COMPLETE_BUNDLE_PRODUCT_ID = '164308cd-e3cd-4026-8fdc-337a5955ffff';

// Empty since 27 Sep 2026: the four labs (Market Microstructure, Fast Greeks,
// OTC and SFT CCR/IMM) now ship inside the consolidated bundle folder
// (products.file_url -> folder 146aFxLyOTeldWkzAP9jlCdYp7EZj3HS7, subfolder
// "13 - New Releases - September 2026"), including the newer OTC v1.0.5 and
// SFT v1.0.3 builds. Sharing them separately as well would duplicate them and
// hand out the older zips. Earlier buyers keep the access they already have.
export const COMPLETE_BUNDLE_EXTRA_RESOURCES = Object.freeze([]);

export function isExpandedCompleteBundle(productId) {
    return String(productId || '') === COMPLETE_BUNDLE_PRODUCT_ID;
}

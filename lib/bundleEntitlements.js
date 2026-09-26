// Entitlements that are included only for NEW purchases of the expanded
// Complete Front Office & Risk Quant Professional Bundle.
// Legacy bundle buyers keep their existing Drive-folder permission only.
export const COMPLETE_BUNDLE_PRODUCT_ID = '164308cd-e3cd-4026-8fdc-337a5955ffff';

export const COMPLETE_BUNDLE_EXTRA_RESOURCES = Object.freeze([
    {
        name: 'Market Microstructure & Market Making for Quants',
        fileId: '1itNtXZgsT4PaYLj-Id4v_mqpZ3yPRSKm',
        fileName: 'Desk2Quant_Market_Microstructure_Final.zip'
    },
    {
        name: 'Fast Greeks & Initial Margin — AAD, SIMM & MVA',
        fileId: '1mrAMeIu4kQ8pkiVlIe7j0AAa8yrlSaCD',
        fileName: 'Desk2Quant_Fast_Greeks_AAD_SIMM_MVA_Final.zip'
    },
    {
        name: 'OTC Counterparty Credit Risk & IMM Quant Lab',
        fileId: '1UHKSKrij2KGY7Z8PVM7pJbAApFSMvLFR',
        fileName: 'Desk2Quant_OTC_Bank_Risk_Quant_Lab_v1.0.4_FINAL.zip'
    },
    {
        name: 'SFT Counterparty Credit Risk & IMM Quant Lab',
        fileId: '1AXJ1j-2wy0L91bVOtJrrveDl6jw3wjlU',
        fileName: 'Desk2Quant_SFT_Bank_Risk_Quant_Lab_v1.0.2_FINAL.zip'
    }
]);

export function isExpandedCompleteBundle(productId) {
    return String(productId || '') === COMPLETE_BUNDLE_PRODUCT_ID;
}

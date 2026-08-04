/**
 * Integration Test: Google Drive Sharing via Webhook Handler
 * 
 * This script imports handleProductPurchase from the API and runs a mock
 * product purchase event. It loads configurations from .env, attempts to 
 * share the Google Drive item with a test email, and sends a test email 
 * using the configured Brevo credentials.
 * 
 * Run: node scripts/test-webhook-drive.js
 */

const fs = require('fs');
const path = require('path');

// 1. Parse and load .env file into process.env
try {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) {
        throw new Error('.env file not found');
    }
    const envContent = fs.readFileSync(envPath, 'utf8');
    const regex = /^([A-Z0-9_]+)\s*=\s*(.*)$/gm;
    let match;
    while ((match = regex.exec(envContent)) !== null) {
        let key = match[1];
        let val = match[2].trim();
        // Remove surrounding quotes if any
        if (val.startsWith('"') && val.endsWith('"')) {
            val = val.substring(1, val.length - 1);
        } else if (val.startsWith("'") && val.endsWith("'")) {
            val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
    }
    console.log('✓ Successfully loaded environment variables from .env');
} catch (err) {
    console.error('✖ Error loading .env configuration:', err.message);
    process.exit(1);
}

// 2. Validate credentials presence
const reqVars = ['BREVO_API_KEY', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY'];
const missing = reqVars.filter(v => !process.env[v]);
if (missing.length > 0) {
    console.error(`✖ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
}

// Fallback values for Supabase if not in process.env
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRudGFibXl1cmxybG5vYWpkbmphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMDEyNjUsImV4cCI6MjA4NTY3NzI2NX0.PYpNd_t_px09zi2d5WGjFVOB23sjb3ZPuAnxagYshe0';

// Set up recipient/mock purchase details
// Let's use an external test email to verify sharing permission grants
const mockCustomerEmail = 'desk2quant@gmail.com';
const mockCustomerName = 'Amit Jha (Test)';
const googleDriveFolderLink = 'https://drive.google.com/drive/folders/1348-cdCTCvQlzvdcArxA__4N6t0cIBy6?usp=drive_link';
const testProductName = 'Complete Front Office & Risk Quant Professional Bundle (40+ PDFs & 60+ scripts)';

async function main() {
    try {
        console.log('\nImporting handleProductPurchase dynamically...');
        const webhookModule = await import('../api/razorpay-webhook.js');
        const handleProductPurchase = webhookModule.handleProductPurchase;

        if (typeof handleProductPurchase !== 'function') {
            throw new Error('handleProductPurchase is not a function export');
        }

        console.log('Fulfilling mock purchase product transaction...');

        await handleProductPurchase({
            paymentId: 'pay_test_drive_' + Date.now(),
            amount: 2999, // 2999 INR
            inrAmount: 2999,
            currency: 'INR',
            customerEmail: mockCustomerEmail,
            customerName: mockCustomerName,
            customerPhone: '+919999999999',
            customerCountry: 'IN',
            productName: testProductName,
            downloadLink: googleDriveFolderLink, // Target folder to share
            SUPABASE_URL: process.env.SUPABASE_URL,
            SUPABASE_KEY: process.env.SUPABASE_KEY,
            BREVO_API_KEY: process.env.BREVO_API_KEY,
            ADMIN_EMAIL: 'drive-sharing-service@desk2quant.iam.gserviceaccount.com', // service account
            SENDER_EMAIL: 'desk2quant@gmail.com',
            SENDER_NAME: 'Desk2Quant'
        });

        console.log('\n✓ Simulation complete! Check terminal output above for logs.');
    } catch (error) {
        console.error('\n✖ Execution failed:', error);
    }
}

main();

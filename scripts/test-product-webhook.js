require('dotenv').config({ path: '.env' });
const fetch = require('node-fetch');

// Mock data for a product purchase
const mockEvent = {
    event: 'payment.captured',
    payload: {
        payment: {
            entity: {
                id: 'pay_test_' + Date.now(),
                amount: 49900, // INR 499.00
                currency: 'INR',
                email: 'desk2quant@gmail.com', // Sending to yourself for testing
                notes: {
                    type: 'product',
                    product_name: 'Python for Quants',
                    customer_name: 'Test Customer',
                    customer_email: 'desk2quant@gmail.com',
                    customer_phone: '9999999999'
                }
            }
        }
    }
};

async function testWebhook() {
    console.log('🚀 Simulating Product Purchase Webhook...');

    // You'll need to run this against your local dev server or the deployed endpoint
    // If running locally, make sure your dev server is up (npm run dev)
    const url = 'http://localhost:3000/api/razorpay-webhook';

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Skip signature verification for testing if possible, 
                // or you'd need to mock it with RAZORPAY_WEBHOOK_SECRET
            },
            body: JSON.stringify(mockEvent)
        });

        const result = await response.json();
        console.log('Response Status:', response.status);
        console.log('Response Body:', result);

        if (response.ok) {
            console.log('✅ Webhook simulation sent successfully!');
            console.log('Please check your email and Supabase for the new purchase.');
        } else {
            console.error('❌ Webhook simulation failed.');
        }
    } catch (err) {
        console.error('❌ Error during simulation:', err);
    }
}

testWebhook();

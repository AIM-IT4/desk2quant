// Real customer + purchase data, pulled from Supabase (purchases table) and
// Razorpay (payment.notes.customer_name) on 2026-07-28.
// couponCode = FIRSTNAME (letters only, uppercased) + '20' — matches the
// exact scheme the automated sendPostPurchaseRecommendations() uses, and is
// accepted by product.html's /^[A-Z]+20$/ coupon rule, so it's guaranteed
// to work at checkout.

module.exports = [
    {
        email: 'venkatkrv12@gmail.com',
        name: 'Venkat Averineni',
        firstName: 'Venkat',
        couponCode: 'VENKAT20',
        purchasedProduct: 'Numerical Methods for Quants: The Master Field Manual'
    },
    {
        email: 'ankit.kr0906@gmail.com',
        name: 'Ankit Kumar',
        firstName: 'Ankit',
        couponCode: 'ANKIT20',
        purchasedProduct: 'XVA Calculus Lab: Master Counterparty Credit Risk'
    },
    {
        email: 'arun.al2010@gmail.com',
        name: 'Arun',
        firstName: 'Arun',
        couponCode: 'ARUN20',
        purchasedProduct: 'XVA Calculus Lab: Master Counterparty Credit Risk'
    },
    {
        email: 'abhinav2good2002@gmail.com',
        name: 'Abhinav',
        firstName: 'Abhinav',
        couponCode: 'ABHINAV20',
        purchasedProduct: 'XVA Calculus Lab: Master Counterparty Credit Risk'
    }
];

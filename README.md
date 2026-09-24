# ALJODA Pharmacy — V2 (real backend starter)

This version moves products, stock and orders from browser localStorage into a server-side SQLite database.

## Run on a computer
1. Install Node.js 20+.
2. Open this folder in Terminal.
3. Run: `npm install`
4. Set production secrets before real use:
   - `JWT_SECRET`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
5. Run: `npm start`
6. Open `http://localhost:3000`
7. Admin: `http://localhost:3000/admin.html`

## What works
- Product catalog from SQLite
- Search and category filtering
- Cart
- Checkout form
- Server-side stock validation and stock reduction when an order is placed
- Admin login with hashed password
- Add products from admin dashboard
- Hide products
- View orders and change order status
- Product image upload endpoint is included

## What remains before public launch
- Deploy the Node app + persistent database/storage.
- Connect a real payment provider if desired.
- Add SMS/WhatsApp/email order notifications.
- Configure delivery zones and fees.
- Add proper audit logs, backups, rate limiting and security headers.
- Review Iraqi pharmacy rules for which medicines can be listed, dispensed or sold online; prescription/restricted medicines should not be automated without the required verification.
- Replace placeholder contact details and product descriptions.

Never use the default admin password in production.

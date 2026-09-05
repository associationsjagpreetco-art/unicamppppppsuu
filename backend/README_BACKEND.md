# UniCampus Store — Backend (Node + Express + SQLite)

Ye backend real login/register, real orders, aur real admin panel (jo pehle localStorage
pe tha) — sabko ek asli database ke peeche connect karta hai.

## Local pe chalana

```bash
cd backend
npm install
node server.js
```

Server `http://localhost:4000` pe start hoga. Pehli baar chalane pe:
- `store.db` (SQLite file) ban jayegi
- `products_seed.json` se wahi 20 products DB me seed ho jayenge (jo pehle `baseProducts`
  me hardcoded the)
- Admin account seed hoga: **uid `admin`, password `Unicampus@26`** (same jo pehle
  `admin/js/admin.js` me hardcoded tha, isliye kuch change nahi karna padega — bas ab ye
  password backend me securely (bcrypt hash) store hota hai, JS file me plain-text nahi).
  Change karna ho toh `ADMIN_UID` / `ADMIN_PASSWORD` env var set karke pehli baar chalao.

## Frontend ko backend se connect karna

`index.html` aur `admin/index.html` dono me top pe ye line hai:
```js
window.CAMPUS_STORE_API_BASE = 'http://localhost:4000';
```
Deploy karte time (Render/Railway pe backend host karne ke baad), is line ko apne live
backend URL se replace kar do, e.g.:
```js
window.CAMPUS_STORE_API_BASE = 'https://unicampus-store-api.onrender.com';
```

## Kya-kya real ho gaya hai ab

- **Login/Register** (`index.html` → Login button) — real password (bcrypt hashed),
  JWT session. Pehle ye sirf ek toast tha (`loginDemo()`), kuch save nahi hota tha.
- **Checkout** — order backend ke SQLite DB me save hota hai, real Order ID milta hai.
  Pehle ye sirf ek `alert()` tha, kahin save nahi hota tha.
- **My Orders** — Login modal ke andar, sign-in karne ke baad "My Orders" button — apna
  order history dikhata hai (backend se fetch).
- **Admin Panel** (`admin/index.html`) — same UI/UX bilkul waisa hi hai (Overview,
  Orders, Products, Profit, Clients — sab kaam karta hai), bas ab data localStorage ki
  jagah backend se aata hai:
  - Product price/stock/details edit ya add/delete karo → turant sabke liye storefront
    pe reflect hoga (kisi bhi device/browser se)
  - Order status change (Processing/Completed/Pending/Cancelled) → DB me save hota hai
  - Admin login bhi ab backend se verify hota hai (pehle sirf JS file me hardcoded tha)

## Render/Railway pe deploy (free)

1. `backend/` folder ko GitHub repo me push karo.
2. Render.com → New → Web Service → repo select karo.
   - Build Command: `npm install`
   - Start Command: `node server.js`
3. Environment variables set karo:
   - `JWT_SECRET` = koi random long string
   - `ADMIN_UID` / `ADMIN_PASSWORD` = agar admin login change karna hai (pehli baar seed
     hone se pehle set karna)
4. Deploy hone ke baad jo URL mile, wahi `index.html` aur `admin/index.html` me
   `CAMPUS_STORE_API_BASE` me daal do.
5. Frontend (index.html, admin/, css, js, assets) already Vercel pe deploy ho raha hai
   (`vercel.json` maujood hai) — usse kuch change nahi karna, bas upar wali ek line update
   karni hai.

⚠️ **Important**: SQLite file (`store.db`) Render/Railway ke free tier pe redeploy hote
time delete ho sakti hai (ephemeral filesystem). Agar real customers/production ke liye
data permanent chahiye, toh Postgres pe migrate karna better hoga — bata dena, kar dunga.

## API Reference

| Method | Path | Auth | Kaam |
|---|---|---|---|
| POST | /api/auth/register | - | Student register |
| POST | /api/auth/login | - | Student/Admin login (role se pata chalta hai kaun hai) |
| GET | /api/auth/me | Bearer token | Session verify |
| GET | /api/products | - | Live product list (public, cost field nahi hai) |
| POST | /api/orders | optional token | Checkout — order save karta hai |
| GET | /api/orders/my | Bearer token | Logged-in student ke apne orders |
| GET | /api/admin/products | Admin token | Admin product list (cost field ke saath) |
| POST | /api/admin/products | Admin token | Naya product add |
| PUT | /api/admin/products/:id | Admin token | Product edit — turant live |
| DELETE | /api/admin/products/:id | Admin token | Product delete |
| GET | /api/admin/orders | Admin token | Sabhi orders |
| PUT | /api/admin/orders/:orderId/status | Admin token | Order status update |

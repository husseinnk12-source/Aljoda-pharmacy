const express = require("express");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_THIS_SECRET_BEFORE_PRODUCTION";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@aljoda-pharmacy.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe123!";

const dataDir = path.join(__dirname, "data");
const uploadDir = path.join(__dirname, "public", "uploads");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const db = new Database(path.join(dataDir, "aljoda.db"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  brand TEXT DEFAULT '',
  category TEXT NOT NULL,
  price INTEGER NOT NULL,
  old_price INTEGER DEFAULT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  description TEXT DEFAULT '',
  image TEXT DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  area TEXT NOT NULL,
  address TEXT NOT NULL,
  payment TEXT NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'New',
  total INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  price INTEGER NOT NULL,
  quantity INTEGER NOT NULL
);
`);

const adminExists = db.prepare("SELECT id FROM admins WHERE email=?").get(ADMIN_EMAIL);
if (!adminExists) {
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 12);
  db.prepare("INSERT INTO admins (email,password_hash) VALUES (?,?)").run(ADMIN_EMAIL, hash);
}

const seedCount = db.prepare("SELECT COUNT(*) AS n FROM products").get().n;
if (!seedCount) {
  const seed = [
    ["CeraVe Moisturizing Cream","CeraVe","Skincare & Beauty",20000,25000,12,"Moisturizing cream.","https://placehold.co/500x400/f7f3eb/8d6b2a?text=CeraVe",1],
    ["Panadol Extra","Panadol","Medicines",5500,null,30,"Pain relief product. Verify dispensing requirements before sale.","https://placehold.co/500x400/f7f3eb/8d6b2a?text=Panadol",1],
    ["Vichy Mineral 89","Vichy","Skincare & Beauty",28000,null,8,"Daily skincare serum.","https://placehold.co/500x400/f7f3eb/8d6b2a?text=Vichy",1],
    ["Centrum Multivitamin","Centrum","Vitamins & Supplements",15000,null,16,"Multivitamin product.","https://placehold.co/500x400/f7f3eb/8d6b2a?text=Centrum",1],
    ["La Roche-Posay Effaclar Gel","La Roche-Posay","Skincare & Beauty",18000,null,9,"Cleansing gel.","https://placehold.co/500x400/f7f3eb/8d6b2a?text=Effaclar",1],
    ["Bepanthen Ointment","Bepanthen","Personal Care",12000,null,14,"Skin care ointment.","https://placehold.co/500x400/f7f3eb/8d6b2a?text=Bepanthen",1]
  ];
  const ins = db.prepare(`INSERT INTO products
    (name,brand,category,price,old_price,stock,description,image,featured)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const tx = db.transaction(rows => rows.forEach(r => ins.run(...r)));
  tx(seed);
}

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    }
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype));
  }
});

function auth(req, res, next) {
  const token = req.cookies.aljoda_admin;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

app.get("/api/products", (req,res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const category = String(req.query.category || "").trim();
  let rows = db.prepare("SELECT * FROM products WHERE active=1 ORDER BY featured DESC, id DESC").all();
  if (category) rows = rows.filter(p => p.category === category);
  if (q) rows = rows.filter(p => `${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(q));
  res.json(rows);
});

app.post("/api/orders", (req,res) => {
  const { customer_name, phone, area, address, payment, notes, items } = req.body || {};
  if (!customer_name || !phone || !area || !address || !payment || !Array.isArray(items) || !items.length)
    return res.status(400).json({error:"Missing required order information."});

  const ids = items.map(i => Number(i.product_id)).filter(Boolean);
  const products = ids.length ? db.prepare(`SELECT * FROM products WHERE id IN (${ids.map(()=>"?").join(",")}) AND active=1`).all(...ids) : [];
  const map = new Map(products.map(p => [p.id,p]));
  let total = 0;
  const normalized = [];
  for (const item of items) {
    const p = map.get(Number(item.product_id));
    const qty = Math.max(1, Number(item.quantity || 1));
    if (!p) return res.status(400).json({error:"A product is unavailable."});
    if (p.stock < qty) return res.status(400).json({error:`Not enough stock for ${p.name}.`});
    total += p.price * qty;
    normalized.push({p, qty});
  }

  const create = db.transaction(() => {
    const order = db.prepare(`INSERT INTO orders
      (customer_name,phone,area,address,payment,notes,total)
      VALUES (?,?,?,?,?,?,?)`).run(customer_name,phone,area,address,payment,notes||"",total);
    const addItem = db.prepare(`INSERT INTO order_items
      (order_id,product_id,product_name,price,quantity) VALUES (?,?,?,?,?)`);
    const reduce = db.prepare("UPDATE products SET stock=stock-? WHERE id=?");
    normalized.forEach(({p,qty}) => {
      addItem.run(order.lastInsertRowid,p.id,p.name,p.price,qty);
      reduce.run(qty,p.id);
    });
    return Number(order.lastInsertRowid);
  });
  const orderId = create();
  res.status(201).json({ok:true, order_id:orderId, total});
});

app.post("/api/admin/login", (req,res) => {
  const {email,password} = req.body || {};
  const admin = db.prepare("SELECT * FROM admins WHERE email=?").get(email);
  if (!admin || !bcrypt.compareSync(password || "", admin.password_hash))
    return res.status(401).json({error:"Invalid email or password."});
  const token = jwt.sign({id:admin.id,email:admin.email}, JWT_SECRET,{expiresIn:"7d"});
  res.cookie("aljoda_admin",token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*24*60*60*1000});
  res.json({ok:true});
});

app.post("/api/admin/logout", auth, (req,res)=>{res.clearCookie("aljoda_admin");res.json({ok:true});});
app.get("/api/admin/me", auth, (req,res)=>res.json({email:req.admin.email}));

app.get("/api/admin/products", auth, (req,res)=>{
  res.json(db.prepare("SELECT * FROM products ORDER BY id DESC").all());
});

app.post("/api/admin/products", auth, (req,res)=>{
  const {name,brand,category,price,old_price,stock,description,image,featured} = req.body || {};
  if (!name || !category || !Number.isFinite(Number(price))) return res.status(400).json({error:"Name, category and price are required."});
  const r = db.prepare(`INSERT INTO products
    (name,brand,category,price,old_price,stock,description,image,featured)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(name,brand||"",category,Number(price),old_price?Number(old_price):null,Number(stock||0),description||"",image||"",featured?1:0);
  res.status(201).json({id:Number(r.lastInsertRowid)});
});

app.post("/api/admin/upload", auth, upload.single("image"), (req,res)=>{
  if (!req.file) return res.status(400).json({error:"Please upload a JPG, PNG or WebP image."});
  res.json({url:`/uploads/${req.file.filename}`});
});

app.patch("/api/admin/products/:id", auth, (req,res)=>{
  const {name,brand,category,price,old_price,stock,description,image,featured,active} = req.body || {};
  db.prepare(`UPDATE products SET name=?,brand=?,category=?,price=?,old_price=?,stock=?,description=?,image=?,featured=?,active=? WHERE id=?`)
    .run(name,brand||"",category,Number(price),old_price?Number(old_price):null,Number(stock||0),description||"",image||"",featured?1:0,active===false?0:1,Number(req.params.id));
  res.json({ok:true});
});

app.delete("/api/admin/products/:id", auth, (req,res)=>{
  db.prepare("UPDATE products SET active=0 WHERE id=?").run(Number(req.params.id));
  res.json({ok:true});
});

app.get("/api/admin/orders", auth, (req,res)=>{
  const orders = db.prepare("SELECT * FROM orders ORDER BY id DESC").all();
  const items = db.prepare("SELECT * FROM order_items WHERE order_id=?");
  res.json(orders.map(o=>({...o,items:items.all(o.id)})));
});

app.patch("/api/admin/orders/:id", auth, (req,res)=>{
  const allowed = ["New","Confirmed","Preparing","Out for Delivery","Delivered","Cancelled"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({error:"Invalid status."});
  db.prepare("UPDATE orders SET status=? WHERE id=?").run(req.body.status,Number(req.params.id));
  res.json({ok:true});
});

app.get('/{*splat}', (req, res) => {
  res.sendFile(...);
});

app.listen(PORT,()=>console.log(`ALJODA Pharmacy running on port ${PORT}`));

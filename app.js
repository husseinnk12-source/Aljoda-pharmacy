let products=[],cart=JSON.parse(localStorage.getItem("aljoda_cart")||"[]");
const money=n=>new Intl.NumberFormat("en-US").format(n)+" IQD";
async function loadProducts(category=""){const q=document.getElementById("search")?.value||"";const u="/api/products?"+new URLSearchParams({q,category});const r=await fetch(u);products=await r.json();renderProducts();document.getElementById("products")?.scrollIntoView({behavior:"smooth"});}
function renderProducts(){const g=document.getElementById("productGrid");if(!g)return;g.innerHTML=products.length?products.map(p=>`<article class="product-card"><button class="heart">♡</button><img src="${p.image||'https://placehold.co/500x400/f7f3eb/8d6b2a?text=ALJODA'}"><h3>${p.name}</h3><div class="meta">${p.brand||""} · Stock: ${p.stock}</div><div class="price">${money(p.price)}</div><div class="stars">★★★★★</div><button class="add" ${p.stock<1?"disabled":""} onclick="addToCart(${p.id})">${p.stock<1?"Out of Stock":"Add to Cart"}</button></article>`).join(""):"<p>No products found.</p>";}
function addToCart(id){const p=products.find(x=>x.id===id);if(!p)return;const x=cart.find(i=>i.product_id===id);if(x)x.quantity++;else cart.push({product_id:id,quantity:1,name:p.name,price:p.price});saveCart();alert("Added to cart");}
function saveCart(){localStorage.setItem("aljoda_cart",JSON.stringify(cart));updateCount();}
function updateCount(){document.getElementById("cartCount").textContent=cart.reduce((s,x)=>s+x.quantity,0)}
function openCart(){const box=document.getElementById("cartItems");let total=0;if(!cart.length)box.innerHTML="<p>Your cart is empty.</p>";else box.innerHTML=cart.map((x,i)=>{total+=x.price*x.quantity;return `<div class="cart-row"><span>${x.name} × ${x.quantity}</span><b>${money(x.price*x.quantity)}</b><button onclick="removeItem(${i})">Remove</button></div>`}).join("");document.getElementById("cartTotal").textContent=money(total);document.getElementById("cartModal").classList.add("show")}
function closeCart(){document.getElementById("cartModal").classList.remove("show")}
function removeItem(i){cart.splice(i,1);saveCart();openCart()}
function goCheckout(){if(!cart.length)return alert("Your cart is empty.");location.href="/checkout.html"}
function focusSearch(){document.getElementById("search").focus()}
function toggleNav(){document.getElementById("nav").classList.toggle("open")}
loadProducts();updateCount();

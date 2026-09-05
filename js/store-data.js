// ==========================================================================
// Campus Store — Shared Data Layer (now backend-backed, not localStorage)
// Used by the Admin Panel (admin/js/admin.js) to talk to the real API:
// real orders placed at checkout, and real product edits that go live for
// every visitor immediately — no more per-browser localStorage overrides.
// ==========================================================================

const StoreData = (function () {
  const API_BASE = window.CAMPUS_STORE_API_BASE || 'http://localhost:4000';
  const ADMIN_TOKEN_KEY = 'admin_token';

  let cache = { products: [], orders: [] };

  function getToken() { return localStorage.getItem(ADMIN_TOKEN_KEY) || ''; }
  function setToken(t) { t ? localStorage.setItem(ADMIN_TOKEN_KEY, t) : localStorage.removeItem(ADMIN_TOKEN_KEY); }

  async function apiRequest(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const t = getToken();
      if (t) headers['Authorization'] = `Bearer ${t}`;
    }
    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw new Error('Could not reach the server. Check your internet connection and try again.');
    }
    let data = {};
    try { data = await res.json(); } catch (_e) {}
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  // ---- Auth ----
  async function adminLogin(uid, password) {
    const data = await apiRequest('/api/auth/login', { method: 'POST', auth: false, body: { uid, password } });
    if (data.user.role !== 'admin') throw new Error('This account is not an admin account.');
    setToken(data.token);
    return data.user;
  }

  function logout() {
    setToken(null);
    cache = { products: [], orders: [] };
  }

  // ---- Load everything fresh from the backend (call before first render) ----
  async function refresh() {
    const [{ products }, { orders }] = await Promise.all([
      apiRequest('/api/admin/products'),
      apiRequest('/api/admin/orders')
    ]);
    cache.products = products;
    cache.orders = orders;
  }

  function getProducts() { return cache.products; }
  function getOrders() { return cache.orders; }

  async function saveProduct(product) {
    const existing = cache.products.find((p) => p.id === product.id);
    let saved;
    if (existing) {
      const { product: p } = await apiRequest(`/api/admin/products/${encodeURIComponent(product.id)}`, { method: 'PUT', body: product });
      saved = p;
    } else {
      const { product: p } = await apiRequest('/api/admin/products', { method: 'POST', body: product });
      saved = p;
    }
    const idx = cache.products.findIndex((p) => p.id === saved.id);
    if (idx >= 0) cache.products[idx] = saved; else cache.products.push(saved);
    return saved;
  }

  async function deleteProduct(id) {
    await apiRequest(`/api/admin/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
    cache.products = cache.products.filter((p) => p.id !== id);
  }

  async function updateOrderStatus(orderId, status) {
    const { order } = await apiRequest(`/api/admin/orders/${encodeURIComponent(orderId)}/status`, { method: 'PUT', body: { status } });
    const idx = cache.orders.findIndex((o) => o.orderId === orderId);
    if (idx >= 0) cache.orders[idx] = order;
    return order;
  }

  function generateId() {
    return 'custom-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ---- Aggregated stats for the admin dashboard (computed client-side, same logic as before) ----
  function getStats() {
    const orders = getOrders();
    const products = getProducts();
    let revenue = 0;
    let profit = 0;
    const clientsMap = {};
    const statusCount = { Completed: 0, Processing: 0, Pending: 0, Cancelled: 0 };
    const byDate = {};
    const byCategory = {};

    orders.forEach((o) => {
      const status = o.status || 'Processing';
      statusCount[status] = (statusCount[status] || 0) + 1;

      const dateKey = (o.orderTime || '').split(',')[0] || 'Unknown';

      if (status !== 'Cancelled') {
        revenue += o.total || 0;
        byDate[dateKey] = (byDate[dateKey] || 0) + (o.total || 0);

        (o.items || []).forEach((item) => {
          const qty = item.qty !== undefined ? item.qty : (item.quantity || 0);
          const prod = products.find((p) => p.id === item.id);
          const cost = prod && typeof prod.cost === 'number' ? prod.cost : Math.round(item.price * 0.6);
          const lineProfit = (item.price - cost) * qty;
          const lineRevenue = item.price * qty;
          profit += lineProfit;

          const cat = prod ? (prod.categoryLabel || prod.category) : 'Other';
          if (!byCategory[cat]) byCategory[cat] = { revenue: 0, cost: 0, profit: 0 };
          byCategory[cat].revenue += lineRevenue;
          byCategory[cat].cost += cost * qty;
          byCategory[cat].profit += lineProfit;
        });
      }

      const key = (o.student && (o.student.custUid || o.student.custPhone)) || o.orderId;
      if (!clientsMap[key]) {
        clientsMap[key] = {
          name: (o.student && o.student.custName) || 'Guest',
          uid: (o.student && o.student.custUid) || '-',
          phone: (o.student && o.student.custPhone) || '-',
          email: (o.student && o.student.custEmail) || '-',
          orders: 0,
          spent: 0,
        };
      }
      clientsMap[key].orders += 1;
      if (status !== 'Cancelled') clientsMap[key].spent += o.total || 0;
    });

    return {
      revenue,
      profit,
      totalOrders: orders.length,
      totalClients: Object.keys(clientsMap).length,
      statusCount,
      clients: Object.values(clientsMap).sort((a, b) => b.spent - a.spent),
      orders: [...orders].sort((a, b) => new Date(b.orderTime) - new Date(a.orderTime)),
      byDate,
      byCategory,
    };
  }

  return {
    adminLogin,
    logout,
    refresh,
    getProducts,
    saveProduct,
    deleteProduct,
    generateId,
    getOrders,
    updateOrderStatus,
    getStats,
    getToken,
  };
})();

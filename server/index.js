import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { fileURLToPath } from 'url';
import { getSupabase, initDb } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 5000;
const USER_COLUMNS = 'id,name,email,role,avatar,phone,address,createdAt';
const USER_DATA_TYPES = new Set(['cart', 'wishlist', 'addresses']);
const PASSWORD_HASH_BYTES = 64;

app.use(cors());
app.use(express.json({ limit: '8mb' }));

let databaseReady = false;
initDb()
  .then(() => {
    databaseReady = true;
  })
  .catch((error) => {
    console.error('Failed to initialize Supabase:', error.message);
  });

app.use((req, res, next) => {
  if (!databaseReady) {
    return res.status(503).json({
      error: 'Supabase is unavailable. Check SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and supabase/schema.sql.',
    });
  }
  next();
});

const run = async (query) => {
  const { data, error } = await query;
  if (error) throw error;
  return data;
};

const hashPassword = (password) => {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, PASSWORD_HASH_BYTES).toString('hex');
  return `scrypt$${salt}$${hash}`;
};

const verifyPassword = (password, storedHash) => {
  const [algorithm, salt, hash] = String(storedHash || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !/^[a-f\d]{128}$/i.test(hash || '')) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

const createSession = async (userId) => {
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await run(getSupabase().from('user_sessions').insert({
    tokenHash,
    userId,
    expiresAt,
  }));
  return token;
};

const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: 'Sign in is required.' });

  try {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const session = await run(
      getSupabase()
        .from('user_sessions')
        .select('userId')
        .eq('tokenHash', tokenHash)
        .gt('expiresAt', new Date().toISOString())
        .maybeSingle()
    );
    if (!session) {
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }

    const user = await run(
      getSupabase()
        .from('users')
        .select('id,role')
        .eq('id', session.userId)
        .maybeSingle()
    );
    if (!user) return res.status(401).json({ error: 'Session account no longer exists.' });
    req.authUser = user;
    req.sessionTokenHash = tokenHash;
    next();
  } catch (error) {
    console.error('Error validating session:', error);
    res.status(500).json({ error: 'Could not validate your session.' });
  }
};

const requireOwnAccount = (req, res, next) => {
  if (req.authUser?.id !== req.params.userId) {
    return res.status(403).json({ error: 'You cannot access another account’s data.' });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (req.authUser?.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access is required.' });
  }
  next();
};

const getAllOrders = async () => {
  const orders = [];
  const pageSize = 1000;
  for (let start = 0; ; start += pageSize) {
    const page = await run(
      getSupabase()
        .from('orders')
        .select('id,userId,total,status,payload,createdAt')
        .order('createdAt', { ascending: false })
        .range(start, start + pageSize - 1)
    );
    orders.push(...page);
    if (page.length < pageSize) return orders;
  }
};

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, avatar, phone, address } = req.body;
  if (
    typeof name !== 'string' || !name.trim() ||
    typeof email !== 'string' || !email.trim() ||
    typeof password !== 'string' || !password
  ) {
    return res.status(400).json({
      error: 'Name, email, and password are required.',
    });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await run(
      getSupabase().from('users').select('id').eq('email', normalizedEmail).maybeSingle()
    );
    if (existing) return res.status(400).json({ error: 'An account with this email already exists.' });

    const account = await run(
      getSupabase()
        .from('users')
        .insert({
          id: randomUUID(),
          name: name.trim(),
          email: normalizedEmail,
          passwordHash: hashPassword(password),
          role: 'user',
          avatar: avatar || null,
          phone: phone || '+1 (555) 000-0000',
          address: address || '123 Fresh Cart Street, Cityville, ST 12345',
        })
        .select(USER_COLUMNS)
        .single()
    );
    const token = await createSession(account.id);
    res.status(201).json({ message: 'Registration successful!', user: account, token });
  } catch (error) {
    console.error('Error in registration:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password, role } = req.body;
  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    !['admin', 'user'].includes(role)
  ) {
    return res.status(400).json({ error: 'Email, password, and a valid account role are required.' });
  }

  try {
    const account = await run(
      getSupabase()
        .from('users')
        .select(`${USER_COLUMNS},passwordHash`)
        .eq('email', email.trim().toLowerCase())
        .maybeSingle()
    );
    const accountRole = ['admin', 'administrator'].includes(
      String(account?.role || '').trim().toLowerCase()
    ) ? 'admin' : 'user';
    if (!account || accountRole !== role || !verifyPassword(password, account.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    delete account.passwordHash;
    account.role = accountRole;
    const token = await createSession(account.id);
    res.json({ message: 'Login successful!', user: account, token });
  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

app.get('/api/auth/profile', authenticate, async (req, res) => {
  try {
    const user = await run(
      getSupabase()
        .from('users')
        .select(USER_COLUMNS)
        .eq('id', req.authUser.id)
        .maybeSingle()
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Could not load account profile.' });
  }
});

app.put('/api/auth/profile', authenticate, async (req, res) => {
  const profile = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body
    : {};
  const fields = ['name', 'phone', 'avatar', 'address']
    .filter((field) => Object.hasOwn(profile, field));
  if (!fields.length) return res.status(400).json({ error: 'At least one profile field is required.' });
  if (Object.hasOwn(profile, 'name') && (typeof profile.name !== 'string' || !profile.name.trim())) {
    return res.status(400).json({ error: 'Name cannot be empty.' });
  }
  if (fields.some((field) => (
    field !== 'name' && profile[field] !== null && typeof profile[field] !== 'string'
  ))) {
    return res.status(400).json({ error: 'Profile fields must be text values.' });
  }

  try {
    const updates = Object.fromEntries(fields.map((field) => [
      field,
      field === 'name' ? profile[field].trim() : profile[field],
    ]));
    const user = await run(
      getSupabase()
        .from('users')
        .update(updates)
        .eq('id', req.authUser.id)
        .select(USER_COLUMNS)
        .maybeSingle()
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: 'Profile updated successfully!', user });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Error updating user profile.' });
  }
});

app.delete('/api/auth/session', authenticate, async (req, res) => {
  try {
    await run(
      getSupabase().from('user_sessions').delete().eq('tokenHash', req.sessionTokenHash)
    );
    res.json({ message: 'Signed out successfully.' });
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({ error: 'Could not sign out.' });
  }
});

app.get('/api/users/:userId/data/:dataType', authenticate, requireOwnAccount, async (req, res) => {
  const { userId, dataType } = req.params;
  if (dataType === 'orders') {
    return res.status(400).json({ error: 'Orders must be loaded through the order service.' });
  }
  if (!USER_DATA_TYPES.has(dataType)) {
    return res.status(400).json({ error: 'Unsupported user data type.' });
  }

  try {
    const record = await run(
      getSupabase()
        .from('user_data')
        .select('payload')
        .eq('userId', userId)
        .eq('dataType', dataType)
        .maybeSingle()
    );
    res.json(Array.isArray(record?.payload) ? record.payload : []);
  } catch (error) {
    console.error(`Error fetching ${dataType} for user:`, error);
    res.status(500).json({ error: `Could not load ${dataType} data.` });
  }
});

app.put('/api/users/:userId/data/:dataType', authenticate, requireOwnAccount, async (req, res) => {
  const { userId, dataType } = req.params;
  if (dataType === 'orders') {
    return res.status(400).json({ error: 'Orders must be created through the order service.' });
  }
  if (!USER_DATA_TYPES.has(dataType)) {
    return res.status(400).json({ error: 'Unsupported user data type.' });
  }
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: 'User data must be an array.' });
  }

  try {
    await run(
      getSupabase()
        .from('user_data')
        .upsert({ userId, dataType, payload: req.body }, { onConflict: 'userId,dataType' })
    );
    res.json({ message: `${dataType} saved successfully.` });
  } catch (error) {
    console.error(`Error saving ${dataType} for user:`, error);
    if (error.code === '23503') return res.status(404).json({ error: 'User not found.' });
    res.status(500).json({ error: `Could not save ${dataType} data.` });
  }
});

app.post('/api/orders', authenticate, async (req, res) => {
  const { id, total, deliveryAddress, paymentMethod, items } = req.body;
  const numericTotal = Number(total);
  if (
    typeof id !== 'string' ||
    !id.trim() ||
    !Number.isFinite(numericTotal) ||
    numericTotal < 0 ||
    !Array.isArray(items) ||
    items.length === 0 ||
    items.some((item) => (
      typeof item?.name !== 'string' ||
      !item.name.trim() ||
      !Number.isFinite(Number(item.qty)) ||
      !Number.isInteger(Number(item.qty)) ||
      Number(item.qty) < 1 ||
      !Number.isFinite(Number(item.price)) ||
      Number(item.price) < 0
    ))
  ) {
    return res.status(400).json({ error: 'A valid order with at least one item is required.' });
  }

  const order = {
    id: id.trim(),
    date: new Date().toISOString(),
    total: numericTotal,
    status: 'processing',
    deliveryAddress: deliveryAddress || null,
    paymentMethod: typeof paymentMethod === 'string' ? paymentMethod : 'cash-or-card-on-delivery',
    items: items.map((item) => ({
      name: item.name,
      qty: Number(item.qty),
      price: Number(item.price),
      image: typeof item.image === 'string' ? item.image : '',
    })),
  };

  try {
    await run(
      getSupabase().from('orders').insert({
        id: order.id,
        userId: req.authUser.id,
        total: order.total,
        status: order.status,
        payload: order,
        createdAt: order.date,
      })
    );
    res.status(201).json({ message: 'Order placed successfully.', order });
  } catch (error) {
    console.error('Error saving order:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'This order ID already exists. Please try placing the order again.' });
    }
    res.status(500).json({ error: 'Could not save your order.' });
  }
});

app.get('/api/orders', authenticate, async (req, res) => {
  try {
    const rows = await run(
      getSupabase()
        .from('orders')
        .select('payload')
        .eq('userId', req.authUser.id)
        .order('createdAt', { ascending: false })
    );
    res.json(rows.map((row) => row.payload));
  } catch (error) {
    console.error('Error fetching account orders:', error);
    res.status(500).json({ error: 'Could not load your order history.' });
  }
});

app.get('/api/admin/orders', authenticate, requireAdmin, async (req, res) => {
  try {
    const rows = await getAllOrders();
    const userIds = [...new Set(rows.map((row) => row.userId))];
    const users = userIds.length
      ? await run(getSupabase().from('users').select('id,name,email').in('id', userIds))
      : [];
    const usersById = new Map(users.map((user) => [user.id, user]));
    res.json(rows.map((row) => ({
      ...row.payload,
      user: usersById.get(row.userId) || null,
    })));
  } catch (error) {
    console.error('Error fetching administrator orders:', error);
    res.status(500).json({ error: 'Could not load all customer orders.' });
  }
});

app.get('/api/admin/summary', authenticate, requireAdmin, async (req, res) => {
  try {
    const rows = await getAllOrders();
    res.json({
      revenue: rows.reduce((total, row) => total + Number(row.total), 0),
      orderCount: rows.length,
    });
  } catch (error) {
    console.error('Error calculating admin summary:', error);
    res.status(500).json({ error: 'Could not load administrator dashboard data.' });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const rows = await run(getSupabase().from('categories').select('*').order('name'));
    res.json(rows);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Error fetching categories from Supabase.' });
  }
});

app.post('/api/categories', authenticate, requireAdmin, async (req, res) => {
  const { name, slug, icon, image } = req.body;
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required.' });
  }

  const catSlug = typeof slug === 'string' && slug.trim()
    ? slug.trim()
    : name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  try {
    const category = await run(
      getSupabase()
        .from('categories')
        .insert({
          id: `cat-${randomUUID()}`,
          slug: catSlug,
          name: name.trim(),
          icon: icon || '🌱',
          image: image || null,
          productCount: 0,
        })
        .select('*')
        .single()
    );
    res.status(201).json({ message: 'Category created successfully', category });
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Error creating category in Supabase.' });
  }
});

app.put('/api/categories/:id', authenticate, requireAdmin, async (req, res) => {
  const { name, slug, icon, image } = req.body;
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required.' });
  }
  const catSlug = typeof slug === 'string' && slug.trim()
    ? slug.trim()
    : name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  try {
    const category = await run(
      getSupabase()
        .from('categories')
        .update({ name: name.trim(), slug: catSlug, icon: icon || '🌱', image: image || null })
        .eq('id', req.params.id)
        .select('id')
        .maybeSingle()
    );
    if (!category) return res.status(404).json({ error: 'Category not found.' });
    res.json({ message: 'Category updated successfully' });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Error updating category.' });
  }
});

app.delete('/api/categories/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const category = await run(
      getSupabase()
        .from('categories')
        .delete()
        .eq('id', req.params.id)
        .select('id')
        .maybeSingle()
    );
    if (!category) return res.status(404).json({ error: 'Category not found.' });
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Error deleting category.' });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const rows = await run(getSupabase().from('products').select('*').order('id', { ascending: false }));
    res.json(rows.map((product) => ({
      ...product,
      price: Number(product.price),
      originalPrice: Number(product.originalPrice),
      stockCount: Number(product.stockCount),
      rating: Number(product.rating),
      reviewCount: Number(product.reviewCount),
      isOrganic: Boolean(product.isOrganic),
      isFeatured: Boolean(product.isFeatured),
      inStock: Boolean(product.inStock),
      gallery: [product.image],
    })));
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Error fetching products from Supabase.' });
  }
});

app.post('/api/products', authenticate, requireAdmin, async (req, res) => {
  const {
    name, category, categoryName, price, originalPrice, weight, stockCount,
    image, description, isOrganic, isFeatured,
  } = req.body;
  const productPrice = Number.parseFloat(price) || 0;
  const parsedOriginalPrice = Number.parseFloat(originalPrice);
  const originalProductPrice = parsedOriginalPrice || productPrice * 1.25;
  const stock = Number.parseInt(stockCount, 10) || 50;
  const productImage = image || 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80';

  try {
    const product = await run(
      getSupabase()
        .from('products')
        .insert({
          id: `p_${randomUUID()}`,
          name: name || 'Untitled Product',
          category: category || 'veg',
          categoryName: categoryName || 'Fresh Vegetables',
          price: productPrice,
          originalPrice: originalProductPrice,
          weight: weight || '500g',
          stockCount: stock,
          image: productImage,
          description: description || 'Fresh quality product.',
          isOrganic: Boolean(isOrganic),
          isFeatured: Boolean(isFeatured),
          inStock: stock > 0,
          rating: 5,
          reviewCount: 1,
        })
        .select('*')
        .single()
    );
    res.status(201).json({
      message: 'Product created successfully in Supabase',
      product: { ...product, gallery: [product.image] },
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Error creating product in Supabase.' });
  }
});

app.put('/api/products/:id', authenticate, requireAdmin, async (req, res) => {
  const {
    name, category, categoryName, price, originalPrice, weight, stockCount,
    image, description, isOrganic, isFeatured,
  } = req.body;
  const productPrice = Number.parseFloat(price);
  const parsedOriginalPrice = Number.parseFloat(originalPrice);
  const originalProductPrice = parsedOriginalPrice || productPrice * 1.25;
  const stock = Number.parseInt(stockCount, 10);

  try {
    const product = await run(
      getSupabase()
        .from('products')
        .update({
          name,
          category,
          categoryName,
          price: productPrice,
          originalPrice: originalProductPrice,
          weight: weight || '500g',
          stockCount: stock,
          image,
          description,
          isOrganic: Boolean(isOrganic),
          isFeatured: Boolean(isFeatured),
          inStock: stock > 0,
        })
        .eq('id', req.params.id)
        .select('id')
        .maybeSingle()
    );
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    res.json({ message: 'Product updated successfully in Supabase' });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Error updating product in Supabase.' });
  }
});

app.put('/api/products/:id/stock', authenticate, requireAdmin, async (req, res) => {
  const stock = Number.parseInt(req.body.stockCount, 10);
  if (!Number.isInteger(stock) || stock < 0) {
    return res.status(400).json({ error: 'Stock count must be a non-negative integer.' });
  }

  try {
    const product = await run(
      getSupabase()
        .from('products')
        .update({ stockCount: stock, inStock: stock > 0 })
        .eq('id', req.params.id)
        .select('id')
        .maybeSingle()
    );
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    res.json({ message: 'Stock updated successfully' });
  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(500).json({ error: 'Error updating stock.' });
  }
});

app.delete('/api/products/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const product = await run(
      getSupabase()
        .from('products')
        .delete()
        .eq('id', req.params.id)
        .select('id')
        .maybeSingle()
    );
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    res.json({ message: 'Product deleted successfully from Supabase' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Error deleting product.' });
  }
});

app.listen(PORT, () => {
  console.log(`[FreshCart Supabase API] running on http://localhost:${PORT}`);
});

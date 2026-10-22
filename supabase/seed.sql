insert into public.categories (id, slug, name, icon, image, "productCount")
values
  ('cat-veg', 'veg', 'Fresh Vegetables', '🌱', 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=500&q=80', 1),
  ('cat-fruits', 'fruits', 'Organic Fruits', '🍎', 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=500&q=80', 1),
  ('cat-dairy', 'dairy', 'Dairy & Eggs', '🥛', 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=500&q=80', 1),
  ('cat-pantry', 'pantry', 'Pantry Essentials', '🍞', 'https://images.unsplash.com/photo-1586444248902-2f64eddc13df?auto=format&fit=crop&w=500&q=80', 1)
on conflict (id) do nothing;

insert into public.products (
  id, name, category, "categoryName", price, "originalPrice", weight, "stockCount",
  image, description, "isOrganic", "isFeatured", "inStock", rating, "reviewCount"
)
values
  ('p1', 'Organic Farm Fresh Broccoli', 'veg', 'Fresh Vegetables', 2.99, 3.99, '1 bunch', 40,
   'https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?auto=format&fit=crop&w=600&q=80',
   'Fresh, crisp broccoli sourced from local farms.', true, true, true, 4.8, 32),
  ('p2', 'Fresh Honeycrisp Apples', 'fruits', 'Organic Fruits', 3.99, 4.99, '1 lb', 50,
   'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=600&q=80',
   'Sweet, crisp apples picked at peak freshness.', true, true, true, 4.9, 47),
  ('p3', 'Organic Whole Milk', 'dairy', 'Dairy & Eggs', 4.79, 5.49, '1 gallon', 25,
   'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=80',
   'Creamy whole milk from pasture-raised dairy cows.', true, false, true, 4.9, 64),
  ('p4', 'Artisanal Sourdough Bread', 'pantry', 'Pantry Essentials', 5.49, 6.29, '600g loaf', 18,
   'https://images.unsplash.com/photo-1586444248902-2f64eddc13df?auto=format&fit=crop&w=600&q=80',
   'Naturally fermented sourdough with a crisp crust.', false, true, true, 4.8, 51)
on conflict (id) do nothing;

insert into public.users (id, name, email, "passwordHash", role, phone)
values (
  'usr-admin',
  'FreshCart Admin',
  'admin@gmail.com',
  'scrypt$freshcart-admin-bootstrap-v1$aa02a710a861588d117da60370c2e8acf88c2076b7217ec63b55928dee6edd7e2a7fb6a15500768c4d7e8dbe37691b6e18715782a799eb37860c7a6b410f8a5e',
  'admin',
  '+1 (555) 999-8888'
)
on conflict (email) do update
set role = excluded.role,
    "passwordHash" = excluded."passwordHash";

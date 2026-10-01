# React + Vite

## FreshCart Supabase setup

FreshCart uses Supabase Postgres through its Express API. The Supabase service-role
secret is used only by the server; do not add it to a `VITE_` variable or expose
it in browser code.

1. Create a Supabase project.
2. In the Supabase SQL Editor, run `supabase/schema.sql`, then `supabase/seed.sql`.
3. Copy the project URL and service-role secret from **Project Settings → API**.
   Put them in the root `.env` file as `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY`. The `.env` file is ignored by Git.
4. Install dependencies with `npm install`, then start the app with `npm run dev`.
5. Register an account in FreshCart. To make that account an administrator, run
   the following in the Supabase SQL Editor, replacing the email:

   ```sql
   update public.users set role = 'admin' where email = 'you@example.com';
   ```

The server hashes account passwords and stores only hashed session tokens. New
registrations always have the `user` role; administrator access must be granted
in the database by a trusted project owner.

The schema and seed scripts create the Supabase tables and starter catalog, but
do not transfer existing rows from a MySQL database. Keep the old database as a
backup and export/import its data separately if it must be retained. Existing
MySQL account passwords are not compatible with the new password-hash format.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.


in my freshcart in when a user1 in My Order History, My Wishlist and checkout and card in own data not all data particulat user purchase and add to card data and admin  when a login then display and admin panel page and in login form in proper select role button like admin and user and current select button proepr add background and Support: +1 (800) 555-FRESH this number like admin phone number this is a dynamically add a dmin profile side and remove Switch Role: like this and why not work category wise filter then work proper.

# The Character Board

A free-form mind-map tool for mapping out an OC's variants (age, world, form, etc.) with images, notes, and connecting threads.

## Run it locally

```bash
npm install
npm run dev
```

Then open the local URL it prints (usually http://localhost:5173).

## Deploy on Vercel

1. Push this whole folder to a new GitHub repo.
2. Go to vercel.com → **Add New... → Project** → import that repo.
3. Vercel will auto-detect it as a **Vite** project — leave the defaults (Build Command: `vite build`, Output Directory: `dist`) and click **Deploy**.

That's it — no extra config needed.

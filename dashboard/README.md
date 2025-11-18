# elweb Dashboard (Complete)

This is the complete Next.js 14 dashboard scaffold integrated with your backend via httpOnly cookie auth.

Run:

```
cd dashboard
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

Login at /auth/login (backend must set httpOnly cookie on /auth/login and /auth/signup).

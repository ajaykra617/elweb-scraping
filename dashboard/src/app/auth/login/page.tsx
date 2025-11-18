'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../../store/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const { setUser } = useAuthStore();   // ⭐ Zustand state setter

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/auth/login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }

      // ⭐ IMPORTANT: Save logged-in user globally so sidebar updates instantly
      setUser(data.user);

      router.push('/jobs');

    } catch (err: any) {
      setError(err.message || 'Network error');
    }
  }

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded shadow">
      <h1 className="text-2xl mb-4">Login</h1>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-sm">Email</label>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full border px-3 py-2 rounded"
          />
        </div>

        <div>
          <label className="block text-sm">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full border px-3 py-2 rounded"
          />
        </div>

        {error && <div className="text-red-600">{error}</div>}

        <div>
          <button className="px-4 py-2 bg-slate-800 text-white rounded">
            Login
          </button>
        </div>
      </form>

      <div className="text-sm mt-3">
        Don't have an account?{' '}
        <a href="/auth/signup" className="text-blue-600">Sign up</a>
      </div>
    </div>
  );
}
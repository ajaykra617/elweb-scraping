export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function handleResponse(res: Response) {
  let data = null;

  try {
    data = await res.json();
  } catch {
    return { error: "Invalid JSON" };
  }

  if (!res.ok) {
    return data || { error: "Request failed" };
  }

  return data;
}

export async function apiGet(path: string, noCache = false) {
  const res = await fetch(`${API}${path}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store" 
  });

  return handleResponse(res);
}

export async function apiPost(path: string, body: any) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return handleResponse(res);
}

export async function apiPostForm(path: string, form: FormData) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    credentials: "include",
    body: form,
  });

  return handleResponse(res);
}
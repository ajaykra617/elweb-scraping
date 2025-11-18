export default function FileIcon({ filename }: { filename: string }) {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (ext === "json") return <span className="text-green-600">🟩 JSON</span>;
  if (ext === "html") return <span className="text-red-600">🔶 HTML</span>;
  if (ext === "log") return <span className="text-gray-600">📄 LOG</span>;

  return <span className="text-blue-600">📁 {ext}</span>;
}
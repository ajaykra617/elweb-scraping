import axios from "axios";

export async function runPythonRPC(payload) {
  const PY_URL = process.env.PY_WORKER_URL || "http://python-service:9000/run";
  const res = await axios.post(PY_URL, payload, { timeout: 300000 });
  return res.data;
}
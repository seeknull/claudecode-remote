import { useState, useEffect, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const setToken = useAuthStore((s) => s.setToken);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/api/auth/status")
      .then((res) => res.json())
      .then((data) => setNeedsSetup(data.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

  const handleSetup = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 4) {
      setError("Password must be at least 4 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Setup failed");
      setToken(data.token);
      navigate("/projects");
    } catch (err: any) {
      setError(err.message || "Setup failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      setToken(data.token);
      navigate("/projects");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  if (needsSetup === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-surface-light rounded-lg p-8 shadow-xl border border-gray-700/50">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-100">
              Claude Code Remote
            </h1>
            <p className="text-gray-400 text-sm mt-2">
              {needsSetup
                ? "Set a password to get started"
                : "Enter password to continue"}
            </p>
          </div>

          <form onSubmit={needsSetup ? handleSetup : handleLogin}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              className="w-full px-4 py-3 bg-surface border border-gray-600 rounded-md
                         text-base text-gray-100 placeholder-gray-500 focus:outline-none
                         focus:border-accent focus:ring-1 focus:ring-accent min-h-[44px]"
            />
            {needsSetup && (
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className="w-full mt-3 px-4 py-3 bg-surface border border-gray-600 rounded-md
                           text-base text-gray-100 placeholder-gray-500 focus:outline-none
                           focus:border-accent focus:ring-1 focus:ring-accent min-h-[44px]"
              />
            )}
            {error && (
              <p className="text-red-400 text-sm mt-2">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || !password || (needsSetup && !confirmPassword)}
              className="w-full mt-4 px-4 py-3 bg-accent hover:bg-accent-hover
                         disabled:opacity-50 disabled:cursor-not-allowed
                         rounded-md text-white font-medium transition-colors min-h-[44px]"
            >
              {loading
                ? needsSetup
                  ? "Setting up..."
                  : "Authenticating..."
                : needsSetup
                  ? "Set Password"
                  : "Login"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

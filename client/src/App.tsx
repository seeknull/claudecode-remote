import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";
import { api } from "./api/http";
import { encodeDir } from "./utils/url";
import LoginPage from "./pages/LoginPage";
import ProjectsPage from "./pages/ProjectsPage";
import SessionsPage from "./pages/SessionsPage";
import ChatPage from "./pages/ChatPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Legacy /chat/:sessionId → lookup directory and redirect to /projects/:projectId/:sessionId
function LegacyRedirect() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    api<{ directory: string }>(`/sessions/${sessionId}`)
      .then((meta) => {
        navigate(`/projects/${encodeDir(meta.directory)}/${sessionId}`, { replace: true });
      })
      .catch(() => setError(true));
  }, [sessionId, navigate]);

  if (error) return <Navigate to="/projects" replace />;
  return null;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <ProjectsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:projectId"
        element={
          <ProtectedRoute>
            <SessionsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:projectId/:sessionId"
        element={
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chat/:sessionId"
        element={
          <ProtectedRoute>
            <LegacyRedirect />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/projects" replace />} />
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}

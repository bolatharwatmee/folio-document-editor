import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import type { ReactNode } from "react";
import { AppProvider, useApp } from "./context/AppContext";
import { UnsavedChangesProvider } from "./context/UnsavedChangesContext";
import { AppLayout } from "./components/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EditorPage } from "./pages/EditorPage";

function RequireUser({ children }: { children: ReactNode }) {
  const { user } = useApp();
  const location = useLocation();
  if (!user) {
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname }}
        replace
      />
    );
  }
  return children;
}

const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/",
    element: (
      <RequireUser>
        <AppLayout />
      </RequireUser>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "documents/:documentId", element: <EditorPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return (
    <AppProvider>
      <UnsavedChangesProvider>
        <RouterProvider router={router} />
      </UnsavedChangesProvider>
    </AppProvider>
  );
}

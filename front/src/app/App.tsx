import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext.tsx';
import { router } from './router.tsx';

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

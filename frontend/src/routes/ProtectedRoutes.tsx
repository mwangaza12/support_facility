import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { type UserRole } from '@/stores/auth.store';

interface ProtectedRouteProps {
    allowedRoles?: UserRole[];
    children?:     React.ReactNode;
}

export default function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
    const { token, user } = useAuthStore();

    if (!token || !user) return <Navigate to="/login" replace />;

    if (allowedRoles && !allowedRoles.includes(user.role))
        return <Navigate to="/unauthorized" replace />;

    // If children passed (e.g. wrapping AppLayout), render them
    // Otherwise render the nested route via <Outlet />
    return children ? <>{children}</> : <Outlet />;
}
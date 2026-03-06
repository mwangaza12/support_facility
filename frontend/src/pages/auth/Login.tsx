import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogoIcon } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/auth.store';

export default function LoginPage() {
    const navigate               = useNavigate();
    const { login, isLoading, error, clearError } = useAuthStore();

    const [email,    setEmail]    = useState('');
    const [password, setPassword] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        clearError();
        try {
            await login(email, password);
            const role = useAuthStore.getState().user?.role;
            if (role === 'admin')                          navigate('/admin');
            else if (role === 'doctor' || role === 'nurse') navigate('/dashboard');
            else                                           navigate('/dashboard');
        } catch {
            // error is already set in the store — nothing to do here
        }
    };

    return (
        <section className="flex min-h-screen bg-zinc-50 px-4 py-16 md:py-32 dark:bg-transparent">
            <form
                onSubmit={handleSubmit}
                className="bg-card m-auto h-fit w-full max-w-sm rounded-[calc(var(--radius)+.125rem)] border p-0.5 shadow-md dark:[--color-muted:var(--color-zinc-900)]">
                <div className="p-8 pb-6">
                    <div>
                        <Link to="/" aria-label="go home">
                            <LogoIcon />
                        </Link>
                        <h1 className="mb-1 mt-4 text-xl font-semibold">Sign In to AfyaLink</h1>
                        <p className="text-sm text-muted-foreground">Welcome back! Sign in to continue</p>
                    </div>

                    {/* Error message */}
                    {error && (
                        <div className="mt-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    <div className="mt-6 space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="email" className="block text-sm">
                                Email
                            </Label>
                            <Input
                                type="email"
                                id="email"
                                name="email"
                                required
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={isLoading}
                            />
                        </div>

                        <div className="space-y-0.5">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="pwd" className="text-sm">
                                    Password
                                </Label>
                                <Button asChild variant="link" size="sm">
                                    <Link to="/forgot-password" className="text-sm">
                                        Forgot your Password?
                                    </Link>
                                </Button>
                            </div>
                            <Input
                                type="password"
                                id="pwd"
                                name="pwd"
                                required
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={isLoading}
                            />
                        </div>

                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? 'Signing in…' : 'Sign In'}
                        </Button>
                    </div>
                </div>

                <div className="bg-muted rounded-(--radius) border p-3">
                    <p className="text-accent-foreground text-center text-sm">
                        Don't have an account?
                        <Button asChild variant="link" className="px-2">
                            <Link to="/register">Create account</Link>
                        </Button>
                    </p>
                </div>
            </form>
        </section>
    );
}
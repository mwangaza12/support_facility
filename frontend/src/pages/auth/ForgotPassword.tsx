import { Link } from 'react-router-dom';
import { LogoIcon } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { ShieldAlert } from 'lucide-react';

/**
 * ForgotPassword
 *
 * AfyaLink is a facility-internal system — there is no public self-service
 * password reset flow. Staff accounts are created and managed by the facility
 * admin via StaffManagement. If a staff member loses their password they should
 * contact their facility administrator.
 *
 * This page exists so the /forgot-password link in Login.tsx doesn't crash
 * the app. A full email-based reset can be wired up later if needed.
 */
export default function ForgotPasswordPage() {
  return (
    <section className="flex min-h-screen bg-zinc-50 px-4 py-16 md:py-32">
      <div className="bg-card m-auto h-fit w-full max-w-sm rounded-[calc(var(--radius)+.125rem)] border p-0.5 shadow-md">
        <div className="p-8 pb-6 space-y-6">
          <div>
            <Link to="/" aria-label="go home">
              <LogoIcon />
            </Link>
            <h1 className="mb-1 mt-4 text-xl font-semibold">Password Reset</h1>
            <p className="text-sm text-muted-foreground">
              AfyaLink staff accounts are managed by your facility administrator.
            </p>
          </div>

          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <ShieldAlert size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              To reset your password, contact your facility's AfyaLink administrator.
              They can set a new temporary password for you via{' '}
              <strong>Admin → Staff Management</strong>.
            </p>
          </div>

          <Button asChild className="w-full" variant="outline">
            <Link to="/login">Back to Sign In</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
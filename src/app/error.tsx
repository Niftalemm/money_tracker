'use client';
import { TriangleAlert } from 'lucide-react';
// Rendering failed: the workspace unmounted, so unlocked state and keys were dropped.
export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="error-screen">
      <div className="auth-card">
        <span className="empty-icon" aria-hidden>
          <TriangleAlert size={22} />
        </span>
        <h1 className="card-title">Something went wrong</h1>
        <p>
          The workspace closed to protect your records. Nothing unsaved was
          written. Sign in and unlock again to continue.
        </p>
        <button type="button" className="primary full large" onClick={reset}>
          Back to sign in
        </button>
      </div>
    </main>
  );
}

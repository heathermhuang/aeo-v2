'use client';
import { useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import type { PublicCheck } from '@/lib/aeo/public-check';
import styles from './AeoApp.module.css';

export const PENDING_SITE = 'aeo-starting-site';
export type StartDraft = { url: string; result: PublicCheck | null };
export default function PublicStart({
  onAccount,
  initial,
}: {
  onAccount: (mode: 'signup' | 'login', draft: StartDraft) => void;
  initial?: StartDraft;
}) {
  const [url, setUrl] = useState(initial?.url || '');
  const [result, setResult] = useState<PublicCheck | null>(initial?.result || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const response = await fetch('/api/aeo/public-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || 'The check could not be completed. Try again.');
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function continueWithSite() {
    if (result) {
      try {
        localStorage.setItem(
          PENDING_SITE,
          JSON.stringify({ domain: result.hostname, expires: Date.now() + 86400000 }),
        );
      } catch {
        /* Storage is optional. */
      }
    }
    onAccount('signup', { url, result });
  }
  return (
    <main className={styles.auth}>
      <header className={styles.startHeader}>
        <a className={styles.wordmark} href="/" aria-label="AEO home">
          aeo<span>↗</span>
        </a>
        <button className={styles.textButton} onClick={() => onAccount('login', { url, result })}>
          Sign in
        </button>
      </header>
      <div className={styles.publicStart}>
        <p className={styles.eyebrow}>Start with your website</p>
        <h1>
          Make your website
          <br />
          easier to discover.
        </h1>
        <p>Check a public page and get a practical next step. No account needed.</p>
        <form onSubmit={check} className={styles.publicForm}>
          <label htmlFor="starting-url">Website URL</label>
          <div>
            <input
              id="starting-url"
              name="url"
              type="text"
              inputMode="url"
              autoComplete="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="https://yourcompany.com"
              required
              maxLength={2048}
              value={url}
              onChange={e => setUrl(e.target.value)}
              disabled={busy}
            />
            <button className={styles.primary} disabled={busy}>
              {busy ? 'Checking website…' : 'Check website'}
              <ArrowRight size={16} />
            </button>
          </div>
          <small>Public HTTPS pages only. Queries and fragments are excluded.</small>
        </form>
        {busy && <p role="status">Checking the page response, title and crawl instructions…</p>}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {result && (
          <section
            className={styles.publicResult}
            aria-label="Website check result"
            aria-live="polite"
          >
            <div>
              <p className={styles.eyebrow}>Your website check</p>
              <h2>{result.hostname}</h2>
              <p className={styles.quiet}>{result.url}</p>
            </div>
            <ol className={styles.publicFindings}>
              {result.findings.map(f => (
                <li key={f.label}>
                  <div>
                    <h3>{f.label}</h3>
                    <span>
                      {f.state === 'action'
                        ? 'Needs attention'
                        : f.state === 'found'
                          ? 'Observed'
                          : 'Not confirmed'}
                    </span>
                  </div>
                  <p>{f.detail}</p>
                  <p>
                    <strong>Next step: </strong>
                    {f.action}
                  </p>
                </li>
              ))}
            </ol>
            <p className={styles.quiet}>
              This checks public responses, not AI rankings or citations. Traffic, conversions and
              AI answers need their own evidence.
            </p>
            <div className={styles.publicContinue}>
              <h3>Keep working on this website</h3>
              <p>Create an account to connect your data, collect evidence and track changes.</p>
              <button className={styles.primary} onClick={continueWithSite}>
                Continue with this website
                <ArrowRight size={16} />
              </button>
              <small>Your website address will be carried into setup.</small>
            </div>
          </section>
        )}
      </div>
      <footer className={styles.authFooter}>
        <span>AEO</span>
        <a href="https://github.com/heathermhuang/aeo-v2">Source & licenses</a>
      </footer>
    </main>
  );
}

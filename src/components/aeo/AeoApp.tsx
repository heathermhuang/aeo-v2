'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  Code2,
  Download,
  Globe,
  LogOut,
  MessageSquare,
  Plus,
  Radio,
  Settings,
  Users,
  X,
} from 'lucide-react';
import styles from './AeoApp.module.css';
type View = 'overview' | 'answers' | 'crawl' | 'traffic' | 'connect' | 'members';
const nav = [
  { id: 'overview', label: 'Overview', icon: ChartNoAxesCombined },
  { id: 'answers', label: 'AI answers', icon: MessageSquare },
  { id: 'crawl', label: 'Crawl access', icon: Radio },
  { id: 'traffic', label: 'Traffic & conversions', icon: ArrowUpRight },
] as const;
async function api(path: string, options: RequestInit = {}) {
  const response = await fetch('/api/aeo/' + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to complete this request.');
  return data;
}
const stamp = (value: string) => (value ? new Date(value).toLocaleString() : 'Not received yet');
const value = (n: number | null) => (n === null ? '—' : n.toLocaleString());
export default function AeoApp() {
  const [session, setSession] = useState<any>(undefined),
    [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');
  const [workspaceId, setWorkspaceId] = useState(''),
    [sites, setSites] = useState<any[]>([]),
    [siteId, setSiteId] = useState(''),
    [report, setReport] = useState<any>(null);
  const [view, setView] = useState<View>('overview'),
    [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [question, setQuestion] = useState(''),
    [requestId, setRequestId] = useState('');
  const [connection, setConnection] = useState<any>(null),
    [people, setPeople] = useState<any[]>([]),
    [answerId, setAnswerId] = useState('');
  const generation = useRef(0);
  async function loadSession() {
    const data = await api('session');
    setSession(data);
    setWorkspaceId(data.workspaces[0]?.id || '');
  }
  useEffect(() => {
    loadSession().catch(() => setSession(null));
  }, []);
  useEffect(() => {
    generation.current++;
    setSites([]);
    setSiteId('');
    setReport(null);
    setConnection(null);
    setPeople([]);
    setAnswerId('');
    setError('');
    setNotice('');
    setView('overview');
    if (!workspaceId) return;
    let active = true;
    setLoading(true);
    api(`workspaces/${workspaceId}/sites`)
      .then(data => {
        if (active) {
          setSites(data.sites);
          setSiteId(data.sites[0]?.id || '');
        }
      })
      .catch(e => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);
  useEffect(() => {
    setReport(null);
    setConnection(null);
    setAnswerId('');
    setQuestion('');
    setRequestId('');
    if (!siteId) return;
    let active = true;
    setLoading(true);
    setError('');
    api(`sites/${siteId}/summary`)
      .then(data => {
        if (active) setReport(data);
      })
      .catch(e => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [siteId]);
  useEffect(() => {
    setError('');
    setNotice('');
    if (view === 'connect' && siteId) {
      let active = true;
      api(`sites/${siteId}/connection`)
        .then(data => {
          if (active) setConnection(data);
        })
        .catch(e => {
          if (active) setError(e.message);
        });
      return () => {
        active = false;
      };
    }
    if (view === 'members' && workspaceId) {
      let active = true;
      api(`workspaces/${workspaceId}/members`)
        .then(data => {
          if (active) setPeople(data.members);
        })
        .catch(e => {
          if (active) setError(e.message);
        });
      return () => {
        active = false;
      };
    }
  }, [view, siteId, workspaceId]);
  async function perform(work: () => Promise<void>) {
    const current = generation.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e: any) {
      if (current === generation.current) setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    const id = siteId,
      current = generation.current;
    const data = await api(`sites/${id}/summary`);
    if (current === generation.current && id === siteId) setReport(data);
  }
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await perform(async () => {
      await api(authMode, {
        method: 'POST',
        body: JSON.stringify({
          email: String(form.get('email')).trim(),
          password: form.get('password'),
          ...(authMode === 'signup' ? { workspace: form.get('workspace') } : {}),
        }),
      });
      await loadSession();
    });
  }
  async function addSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await perform(async () => {
      const website = await api('sites', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, domain: form.get('domain') }),
      });
      setSites(current => [...current, website]);
      setSiteId(website.id);
      setView('overview');
      setAdding(false);
    });
  }
  async function importData(event: FormEvent<HTMLFormElement>, kind: 'logs' | 'catalog') {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await perform(async () => {
      await api(`sites/${siteId}/${kind}`, {
        method: 'POST',
        body: JSON.stringify({ format: form.get('format'), content: form.get('content') }),
      });
      await refresh();
      setNotice(
        kind === 'logs'
          ? 'Logs imported. Crawl observations are ready to inspect.'
          : 'Page inventory saved.',
      );
    });
  }
  async function exportData() {
    await perform(async () => {
      const data = await api(`sites/${siteId}/export`);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'aeo-evidence.json';
      link.click();
      URL.revokeObjectURL(url);
    });
  }
  const selected = sites.find(s => s.id === siteId),
    workspace = session?.workspaces.find(w => w.id === workspaceId),
    readOnly = workspace?.role === 'team-view-only';
  const heading =
    view === 'connect'
      ? 'Connect your website'
      : view === 'members'
        ? 'Workspace members'
        : nav.find(n => n.id === view)?.label || 'Overview';
  if (session === undefined)
    return (
      <div className={styles.wait} role="status">
        Opening your workspace…
      </div>
    );
  if (!session)
    return (
      <main className={styles.auth}>
        <a className={styles.wordmark} href="/" aria-label="AEO home">
          aeo<span>↗</span>
        </a>
        <div className={styles.authBody}>
          <section className={styles.authIntro}>
            <p className={styles.eyebrow}>A clearer view of AI discovery</p>
            <h1>
              See what AI finds.
              <br />
              Know what to do next.
            </h1>
            <p>Bring answers, crawl access, and real website traffic into one focused workspace.</p>
            <div className={styles.authSequence}>
              <span>
                <Globe size={18} />
                Add your website
              </span>
              <ChevronRight size={16} />
              <span>
                <Radio size={18} />
                Connect evidence
              </span>
              <ChevronRight size={16} />
              <span>
                <ArrowUpRight size={18} />
                Find your next step
              </span>
            </div>
            <p className={styles.quiet}>
              Your data stays private to your workspace. No invented visibility scores.
            </p>
          </section>
          <section className={styles.authPanel}>
            <div className={styles.tabs}>
              <button
                type="button"
                aria-pressed={authMode === 'signup'}
                onClick={() => {
                  setAuthMode('signup');
                  setError('');
                }}
              >
                Create workspace
              </button>
              <button
                type="button"
                aria-pressed={authMode === 'login'}
                onClick={() => {
                  setAuthMode('login');
                  setError('');
                }}
              >
                Sign in
              </button>
            </div>
            <h2>{authMode === 'signup' ? 'Start with your website.' : 'Welcome back.'}</h2>
            <form onSubmit={authenticate}>
              {authMode === 'signup' && (
                <label>
                  Workspace name
                  <input
                    name="workspace"
                    autoComplete="organization"
                    placeholder="Your team or company"
                    minLength={2}
                    maxLength={50}
                    required
                  />
                </label>
              )}
              <label>
                Email
                <input type="email" name="email" autoComplete="username" required />
              </label>
              <label>
                Password
                <input
                  type="password"
                  name="password"
                  autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                  minLength={authMode === 'signup' ? 12 : 1}
                  maxLength={72}
                  required
                />
                {authMode === 'signup' && <small>At least 12 characters.</small>}
              </label>
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              <button className={styles.primary} disabled={busy}>
                {busy
                  ? 'Opening workspace…'
                  : authMode === 'signup'
                    ? 'Create workspace'
                    : 'Sign in'}
                <ArrowRight size={16} />
              </button>
              <p className={styles.quiet}>Candidate release · billing is off</p>
            </form>
          </section>
        </div>
        <footer className={styles.authFooter}>
          AEO v2 · Built on GEOInflow and Umami.{' '}
          <a href="https://github.com/heathermhuang/aeo-v2">Source & licenses</a>
        </footer>
      </main>
    );
  return (
    <div className={styles.app}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <aside className={styles.sidebar}>
        <a href="/" className={styles.wordmark}>
          aeo<span>↗</span>
          <small>WORKSPACE</small>
        </a>
        <label className={styles.workspaceLabel}>
          Workspace
          <select
            aria-label="Workspace"
            disabled={busy}
            value={workspaceId}
            onChange={e => {
              generation.current++;
              setReport(null);
              setSites([]);
              setSiteId('');
              setConnection(null);
              setPeople([]);
              setWorkspaceId(e.target.value);
            }}
          >
            {session.workspaces.map(w => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.siteControl}>
          <label>
            Website
            <select
              aria-label="Website"
              value={siteId}
              disabled={!sites.length || busy}
              onChange={e => {
                generation.current++;
                setReport(null);
                setConnection(null);
                setAnswerId('');
                setSiteId(e.target.value);
              }}
            >
              {!sites.length && <option>No websites yet</option>}
              {sites.map(s => (
                <option key={s.id} value={s.id}>
                  {s.domain}
                </option>
              ))}
            </select>
          </label>
          {!readOnly && (
            <button
              className={styles.iconButton}
              onClick={() => setAdding(true)}
              aria-label="Add website"
            >
              <Plus size={17} />
            </button>
          )}
        </div>
        <nav aria-label="Main navigation">
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              aria-current={view === id ? 'page' : undefined}
              onClick={() => setView(id)}
            >
              <Icon size={18} />
              <span className={styles.desktopNavLabel}>{label}</span>
              <span className={styles.phoneNavLabel}>
                {
                  { overview: 'Overview', answers: 'Answers', crawl: 'Crawl', traffic: 'Traffic' }[
                    id
                  ]
                }
              </span>
            </button>
          ))}
        </nav>
        <div className={styles.sideBottom}>
          <button onClick={() => setView('members')}>
            <Users size={17} />
            Members
          </button>
          <span title={session.user.email}>{session.user.email}</span>
          <button
            onClick={() =>
              perform(async () => {
                await api('logout', { method: 'POST', body: '{}' });
                generation.current++;
                setReport(null);
                setSites([]);
                setWorkspaceId('');
                setSession(null);
              })
            }
          >
            <LogOut size={16} />
            Sign out
          </button>
          <small>AEO v2 · Candidate</small>
        </div>
      </aside>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <span className={styles.breadcrumb}>
              {selected?.domain || workspace?.name || 'Your workspace'}
            </span>
            <h1>{heading}</h1>
          </div>
          <div className={styles.headerActions}>
            {siteId && view !== 'members' && (
              <>
                <button
                  className={styles.secondary}
                  disabled={busy}
                  onClick={() => perform(refresh)}
                >
                  Refresh
                </button>
                <button
                  className={styles.secondary}
                  aria-label="Export website evidence"
                  disabled={busy || !report}
                  onClick={exportData}
                >
                  <Download size={16} />
                  <span>Export</span>
                </button>
                <button className={styles.primary} onClick={() => setView('connect')}>
                  <Code2 size={16} />
                  Connect
                </button>
              </>
            )}
          </div>
        </header>
        <main id="main" className={styles.main}>
          {error && (
            <div role="alert" className={styles.error}>
              {error}
            </div>
          )}
          {notice && (
            <div role="status" className={styles.notice}>
              {notice}
            </div>
          )}
          {adding && (
            <section className={styles.setup}>
              <div className={styles.sectionHeading}>
                <h2>Add a website</h2>
                <button
                  aria-label="Close add website"
                  className={styles.iconButton}
                  onClick={() => setAdding(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={addSite} className={styles.inlineForm}>
                <label>
                  Website domain
                  <input name="domain" placeholder="yourcompany.com" required autoFocus />
                </label>
                <button className={styles.primary} disabled={busy}>
                  Add website
                  <ArrowRight size={16} />
                </button>
              </form>
              <p className={styles.quiet}>
                Use a website you control. Up to {session.limits.sites} websites in this candidate.
              </p>
            </section>
          )}
          {!sites.length && !loading && !adding && view !== 'members' && (
            <section className={styles.empty}>
              <div className={styles.emptyIcon}>
                <Globe size={30} />
              </div>
              <p className={styles.eyebrow}>Your first step</p>
              <h2>Add the website you want to understand.</h2>
              <p>Start with a domain. Then connect the evidence you have, one source at a time.</p>
              {!readOnly && (
                <button className={styles.primary} onClick={() => setAdding(true)}>
                  Add your website
                  <Plus size={17} />
                </button>
              )}
              <div className={styles.emptySteps}>
                <span>
                  01 <strong>Add a website</strong>
                </span>
                <span>
                  02 <strong>Connect a source</strong>
                </span>
                <span>
                  03 <strong>Inspect your first finding</strong>
                </span>
              </div>
            </section>
          )}
          {loading && (
            <p role="status" className={styles.quiet}>
              Loading website evidence…
            </p>
          )}
          {report && view === 'overview' && (
            <>
              <section className={styles.finding}>
                <p className={styles.eyebrow}>
                  {report.traffic.state === 'observed'
                    ? 'Your website at a glance'
                    : 'Let’s connect the first evidence'}
                </p>
                <h2>{report.findings[0]?.title || 'Your sources are connected.'}</h2>
                <p>
                  {report.findings[0]?.detail ||
                    'Inspect the observations below and use the same evidence when you recheck.'}
                </p>
                <button
                  className={styles.textButton}
                  onClick={() => setView((report.findings[0]?.view || 'traffic') as View)}
                >
                  {report.findings[0]?.action || 'Inspect traffic'}
                  <ArrowRight size={17} />
                </button>
              </section>
              <div className={styles.metrics}>
                <Metric
                  title="AI referral visits"
                  number={report.traffic.aiReferralVisits}
                  note={
                    report.traffic.state === 'observed'
                      ? 'Recorded referring sessions'
                      : 'Connect qualified browser data'
                  }
                />
                <Metric
                  title="AI-identified requests"
                  number={report.crawl.state === 'observed' ? report.crawl.requests : null}
                  note={
                    report.crawl.state === 'observed'
                      ? `${report.crawl.verified} verified by IP range`
                      : 'Connect server or CDN logs'
                  }
                />
                <Metric
                  title="Conversions"
                  number={report.traffic.conversions}
                  note={
                    report.settings.goalEvent
                      ? `Event: ${report.settings.goalEvent}`
                      : 'Choose a conversion event'
                  }
                />
              </div>
              <div className={styles.sectionHeading}>
                <h2>Next steps</h2>
                <span>{report.window}</span>
              </div>
              <div className={styles.actionList}>
                {report.findings.length > 1 ? (
                  report.findings.slice(1).map((f, i) => (
                    <button key={f.title} onClick={() => setView(f.view as View)}>
                      <span className={styles.stepNumber}>{String(i + 2).padStart(2, '0')}</span>
                      <span>
                        <strong>{f.title}</strong>
                        <small>{f.detail}</small>
                      </span>
                      <ArrowUpRight size={18} />
                    </button>
                  ))
                ) : (
                  <p>
                    Review your page coverage and recorded referrals. Connected sources do not
                    establish rankings or causal improvement.
                  </p>
                )}
              </div>
              <div className={styles.sectionHeading}>
                <h2>Connection health</h2>
                <button className={styles.textButton} onClick={() => setView('connect')}>
                  Manage connections
                  <ArrowRight size={15} />
                </button>
              </div>
              <div className={styles.connections}>
                <Connection
                  title="Website tracking"
                  status={report.traffic.receivedEvents ? 'Events received' : 'Waiting for events'}
                  detail={stamp(report.traffic.lastReceivedAt)}
                />
                <Connection
                  title="Crawler logs"
                  status={report.crawl.lastImportAt ? 'Logs received' : 'Not connected'}
                  detail={stamp(report.crawl.lastImportAt)}
                />
                <Connection
                  title="Page inventory"
                  status={
                    report.crawl.inventory ? `${report.crawl.inventory} pages` : 'Not connected'
                  }
                  detail="Important pages you provide"
                />
              </div>
            </>
          )}
          {report && view === 'answers' && (
            <>
              <section className={styles.pageIntro}>
                <h2>Keep the answer and its context together.</h2>
                <p>
                  Inspect captured responses to your buyer questions. Imported text stays labelled
                  as user supplied; it does not establish a ranking or citation score.
                </p>
              </section>
              {!readOnly && (
                <section className={styles.setup}>
                  <h3>Ask one buyer question</h3>
                  <p>
                    {session.providerReady
                      ? `Collect one response through ${session.answerModel}. API collection; search is not requested.`
                      : 'Provider collection needs an operator-configured model and usage allowance. You can save a response below.'}
                  </p>
                  <form
                    className={styles.inlineForm}
                    onSubmit={event => {
                      event.preventDefault();
                      const id = requestId || crypto.randomUUID();
                      setRequestId(id);
                      perform(async () => {
                        const result = await api(`sites/${siteId}/run-answer`, {
                          method: 'POST',
                          body: JSON.stringify({ question, requestId: id }),
                        });
                        await refresh();
                        setNotice(
                          result.state !== 'complete'
                            ? `This check is ${result.state}. No new provider call was started.`
                            : result.reused
                              ? 'Showing the existing check. No new provider call was started.'
                              : 'Answer captured. Read the response below.',
                        );
                      });
                    }}
                  >
                    <label>
                      Buyer question
                      <input
                        name="buyerQuestion"
                        minLength={5}
                        maxLength={500}
                        value={question}
                        onChange={e => {
                          setQuestion(e.target.value);
                          setRequestId('');
                        }}
                        placeholder="Which tools work best for my team?"
                        required
                      />
                    </label>
                    <button className={styles.primary} disabled={busy || !session.providerReady}>
                      {busy ? 'Collecting…' : 'Run answer check'}
                    </button>
                  </form>
                  {requestId && (
                    <button
                      type="button"
                      className={styles.textButton}
                      disabled={busy}
                      onClick={() => {
                        setRequestId('');
                        setNotice('Ready for a new check.');
                      }}
                    >
                      Prepare another check
                    </button>
                  )}
                  <p className={styles.quiet}>
                    An API response does not establish what a consumer chat interface returned. No
                    citation or ranking score is inferred.
                  </p>
                </section>
              )}
              {report.jobs?.some(j => j.state !== 'complete') && (
                <div className={styles.sourceRows}>
                  {report.jobs
                    .filter(j => j.state !== 'complete')
                    .map(j => (
                      <div key={j.id}>
                        <span>
                          {j.question}
                          <small>{stamp(j.createdAt)}</small>
                        </span>
                        <strong>
                          {j.state === 'interrupted' ? 'Interrupted; no automatic retry' : j.state}
                        </strong>
                      </div>
                    ))}
                </div>
              )}
              {!report.answers.length && (
                <div className={styles.blank}>
                  <MessageSquare size={24} />
                  <h3>No answers saved yet</h3>
                  <p>Add a response you collected to start your evidence history.</p>
                </div>
              )}
              <div className={styles.answers}>
                {report.answers.map(a => (
                  <article key={a.id}>
                    <button
                      className={styles.answerTitle}
                      aria-expanded={answerId === a.id}
                      onClick={() => setAnswerId(answerId === a.id ? '' : a.id)}
                    >
                      <span>
                        <strong>{a.question}</strong>
                        <small>
                          {a.method} ·{' '}
                          {a.sourceKind === 'user_import'
                            ? 'User-supplied response'
                            : 'API observation'}{' '}
                          · {stamp(a.createdAt)}
                        </small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                    {answerId === a.id && <pre className={styles.answerBody}>{a.answer}</pre>}
                  </article>
                ))}
              </div>
              {!readOnly && (
                <details className={styles.disclosure}>
                  <summary>Add a captured answer</summary>
                  <form
                    onSubmit={event => {
                      event.preventDefault();
                      const f = new FormData(event.currentTarget);
                      perform(async () => {
                        await api(`sites/${siteId}/answers`, {
                          method: 'POST',
                          body: JSON.stringify({
                            question: f.get('question'),
                            method: f.get('method'),
                            answer: f.get('answer'),
                          }),
                        });
                        await refresh();
                        setNotice('Answer saved as user-supplied evidence.');
                      });
                    }}
                  >
                    <label>
                      Buyer question
                      <input
                        name="question"
                        minLength={5}
                        maxLength={500}
                        required
                        placeholder="Which tools work best for my team?"
                      />
                    </label>
                    <label>
                      Where you collected it
                      <input
                        name="method"
                        maxLength={160}
                        required
                        placeholder="Platform, model, and collection method"
                      />
                    </label>
                    <label>
                      Complete response
                      <textarea name="answer" rows={7} maxLength={24000} required />
                    </label>
                    <button className={styles.primary} disabled={busy}>
                      Save answer
                    </button>
                  </form>
                </details>
              )}
            </>
          )}
          {report && view === 'crawl' && (
            <>
              <section className={styles.pageIntro}>
                <h2>Can AI reach your important pages?</h2>
                <p>
                  These are observed requests from your logs. Access does not prove indexing,
                  training, or an answer citation.
                </p>
              </section>
              <div className={styles.metrics}>
                <Metric
                  title="AI-identified requests"
                  number={report.crawl.state === 'observed' ? report.crawl.requests : null}
                  note="Identified from provided logs"
                />
                <Metric
                  title="Requests with errors"
                  number={report.crawl.state === 'observed' ? report.crawl.errors : null}
                  note="HTTP status 400 or above"
                />
                <Metric
                  title="Inventory pages observed"
                  number={report.crawl.coverage}
                  note={
                    report.crawl.inventory
                      ? `Across ${report.crawl.inventory} listed pages`
                      : 'Add an inventory first'
                  }
                />
              </div>
              {report.accessErrors?.length > 0 && (
                <>
                  <div className={styles.sectionHeading}>
                    <h2>Requests to review</h2>
                    <span>Up to 50 path and response groups</span>
                  </div>
                  <div className={styles.tableWrap}>
                    <table>
                      <thead>
                        <tr>
                          <th>Page</th>
                          <th>HTTP response</th>
                          <th>Crawler identity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.accessErrors.map((r, i) => (
                          <tr key={i}>
                            <td>{r.path}</td>
                            <td>
                              {r.status} · {r.requests} request{r.requests === 1 ? '' : 's'}
                            </td>
                            <td>
                              <strong>{r.bot}</strong>
                              <small>
                                {r.verification === 'verified_range'
                                  ? 'Verified by IP range'
                                  : 'Unverified identity claim'}
                              </small>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <div className={styles.sectionHeading}>
                <h2>Important pages</h2>
                <span>Up to 50 pages · least crawled first</span>
              </div>
              {report.pages.length ? (
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>Page</th>
                        <th>AI-identified requests</th>
                        <th>Last observed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.pages.map(p => (
                        <tr key={p.path}>
                          <td>
                            <strong>{p.title || p.path}</strong>
                            <small>{p.path}</small>
                          </td>
                          <td>{report.crawl.state === 'observed' ? p.requests : '—'}</td>
                          <td>{p.lastCrawledAt ? stamp(p.lastCrawledAt) : 'No observation'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={styles.blank}>
                  <h3>Give crawl activity a useful denominator.</h3>
                  <p>Add your important pages to compare your inventory with observed requests.</p>
                </div>
              )}
              {!readOnly && (
                <div className={styles.imports}>
                  <details className={styles.disclosure}>
                    <summary>Import crawler logs</summary>
                    <p className={styles.quiet}>
                      Use logs from a server or CDN you control. Imports retain their verification
                      limits.
                    </p>
                    <form onSubmit={event => importData(event, 'logs')}>
                      <label>
                        Log format
                        <select name="format">
                          <option value="combined">Nginx / Apache combined</option>
                          <option value="json">JSON</option>
                        </select>
                      </label>
                      <label>
                        Log content
                        <textarea name="content" rows={7} required maxLength={900000} />
                      </label>
                      <button className={styles.primary} disabled={busy}>
                        Import logs
                      </button>
                    </form>
                  </details>
                  <details className={styles.disclosure}>
                    <summary>Add page inventory</summary>
                    <form onSubmit={event => importData(event, 'catalog')}>
                      <label>
                        Inventory format
                        <select name="format">
                          <option value="json">JSON</option>
                          <option value="csv">CSV</option>
                          <option value="sitemap">Sitemap XML</option>
                        </select>
                      </label>
                      <label>
                        Page inventory
                        <textarea
                          name="content"
                          rows={7}
                          placeholder={
                            '[{"url":"https://yourcompany.com/pricing","title":"Pricing"}]'
                          }
                          required
                          maxLength={900000}
                        />
                      </label>
                      <button className={styles.primary} disabled={busy}>
                        Save inventory
                      </button>
                    </form>
                  </details>
                </div>
              )}
            </>
          )}
          {report && view === 'traffic' && (
            <>
              <section className={styles.pageIntro}>
                <h2>What AI discovery brings to your website.</h2>
                <p>
                  Qualified browser observations, recorded AI referrers, and your chosen conversion
                  event. Referrer loss and untracked visits remain outside this view.
                </p>
              </section>
              <div className={styles.metrics}>
                <Metric
                  title="Pageviews"
                  number={report.traffic.pageviews}
                  note="Qualified browser population"
                />
                <Metric
                  title="AI referral visits"
                  number={report.traffic.aiReferralVisits}
                  note="Supported referring domains"
                />
                <Metric
                  title="Conversions"
                  number={report.traffic.conversions}
                  note={report.settings.goalEvent || 'No conversion event selected'}
                />
              </div>
              <div className={styles.sectionHeading}>
                <h2>Recorded AI sources</h2>
                <span>{report.window}</span>
              </div>
              {report.referrals.length ? (
                <div className={styles.sourceRows}>
                  {report.referrals.map(r => (
                    <div key={r.source}>
                      <span>{r.source}</span>
                      <strong>{value(r.visits)} visits</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.blank}>
                  <h3>
                    {report.traffic.state === 'observed'
                      ? 'No supported AI referrers observed.'
                      : 'Connect qualified traffic first.'}
                  </h3>
                  <p>
                    {report.traffic.state === 'observed'
                      ? 'This does not establish that AI generated no visits. Referrers may be missing.'
                      : 'We keep missing data separate from an observed zero.'}
                  </p>
                </div>
              )}
              {!readOnly && (
                <details className={styles.disclosure}>
                  <summary>Choose a conversion event</summary>
                  <p className={styles.quiet}>
                    Use an event your website actually sends, such as signup_completed. This counts
                    all occurrences, not conversions attributed to AI.
                  </p>
                  <form
                    onSubmit={event => {
                      event.preventDefault();
                      const f = new FormData(event.currentTarget);
                      perform(async () => {
                        await api(`sites/${siteId}/goal`, {
                          method: 'PUT',
                          body: JSON.stringify({ goalEvent: f.get('goalEvent') }),
                        });
                        await refresh();
                        setNotice('Conversion event saved.');
                      });
                    }}
                  >
                    <label>
                      Event name
                      <input
                        name="goalEvent"
                        defaultValue={report.settings.goalEvent || ''}
                        maxLength={50}
                        required
                      />
                    </label>
                    <button className={styles.primary} disabled={busy}>
                      Save event
                    </button>
                  </form>
                </details>
              )}
            </>
          )}
          {siteId && view === 'connect' && (
            <>
              <section className={styles.pageIntro}>
                <h2>Connect one source. Verify it arrived.</h2>
                <p>
                  Tracking brings browser visits. Server logs bring crawler activity. You can start
                  with either.
                </p>
              </section>
              <section className={styles.setup}>
                <div className={styles.sectionHeading}>
                  <h2>1. Install website tracking</h2>
                  <span>
                    {report?.traffic.receivedEvents
                      ? 'Events received'
                      : 'Waiting for the first event'}
                  </span>
                </div>
                <p>Add this snippet to your shared page template, then open a normal page.</p>
                <label>
                  Tracking code
                  <textarea
                    aria-label="Tracking code"
                    readOnly
                    rows={4}
                    value={connection?.script || 'Loading tracking code…'}
                  />
                </label>
                <button
                  className={styles.secondary}
                  disabled={busy}
                  onClick={() =>
                    perform(async () => {
                      await refresh();
                      setNotice('Connection status refreshed.');
                    })
                  }
                >
                  Check connection
                </button>
                <p className={styles.quiet}>Last event: {stamp(report?.traffic.lastReceivedAt)}</p>
                <details className={styles.disclosure}>
                  <summary>Why traffic totals may be unavailable</summary>
                  <p className={styles.quiet}>
                    The collector needs trustworthy browser identity information from your reverse
                    proxy. Automated or excluded events stay out of qualified totals. This setup
                    check does not prevent us from recording that events arrived.
                  </p>
                </details>
              </section>
              <section className={styles.setup}>
                <h2>2. Add crawler evidence</h2>
                <p>Import a server or CDN log, then add an inventory of important pages.</p>
                <button className={styles.textButton} onClick={() => setView('crawl')}>
                  Open crawl access
                  <ArrowRight size={16} />
                </button>
              </section>
            </>
          )}
          {view === 'members' && (
            <>
              <section className={styles.pageIntro}>
                <h2>A private workspace for your team.</h2>
                <p>
                  Members see only the websites in this workspace. Removed access is checked on the
                  next request.
                </p>
              </section>
              <div className={styles.sourceRows}>
                {people.map(p => (
                  <div key={p.id}>
                    <span>
                      {p.email}
                      <small>{p.role.replace('team-', '')}</small>
                    </span>
                    {workspace?.role === 'team-owner' && p.id !== session.user.id && (
                      <button
                        className={styles.secondary}
                        disabled={busy}
                        onClick={() =>
                          perform(async () => {
                            await api(`workspaces/${workspaceId}/members/${p.id}`, {
                              method: 'DELETE',
                              body: '{}',
                            });
                            setPeople((await api(`workspaces/${workspaceId}/members`)).members);
                          })
                        }
                      >
                        Remove access
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {workspace?.role === 'team-owner' && (
                <details className={styles.disclosure}>
                  <summary>Add an existing AEO account</summary>
                  <form
                    onSubmit={event => {
                      event.preventDefault();
                      const f = new FormData(event.currentTarget);
                      perform(async () => {
                        await api(`workspaces/${workspaceId}/members`, {
                          method: 'POST',
                          body: JSON.stringify({ email: f.get('email'), role: f.get('role') }),
                        });
                        setPeople((await api(`workspaces/${workspaceId}/members`)).members);
                        setNotice('Workspace access granted.');
                      });
                    }}
                  >
                    <label>
                      Account email
                      <input name="email" type="email" required />
                    </label>
                    <label>
                      Access
                      <select name="role">
                        <option value="team-view-only">View only</option>
                        <option value="team-manager">Manage websites and evidence</option>
                      </select>
                    </label>
                    <button className={styles.primary} disabled={busy}>
                      Grant workspace access
                    </button>
                  </form>
                </details>
              )}
            </>
          )}
          <footer className={styles.footer}>
            <span>
              {report && view !== 'members'
                ? `${report.window} · Updated ${stamp(report.generatedAt)}`
                : 'Private workspace · Billing is off'}
            </span>
            <a href="https://github.com/heathermhuang/aeo-v2">Built on GEOInflow & Umami</a>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Metric({ title, number, note }: { title: string; number: number | null; note: string }) {
  return (
    <div className={styles.metric}>
      <span>{title}</span>
      <strong>{value(number)}</strong>
      <small>{note}</small>
    </div>
  );
}
function Connection({ title, status, detail }: { title: string; status: string; detail: string }) {
  return (
    <div>
      <span className={styles.connectionDot} />
      <strong>{title}</strong>
      <span>{status}</span>
      <small>{detail}</small>
    </div>
  );
}

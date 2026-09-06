import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import {
  acceptedSchema,
  confirmedSchema,
  meSchema,
} from "../shared/contracts.ts";
import { api, ApiError, errorMessage } from "./api.ts";
import "./style.css";
function Home() {
  return (
    <>
      <p className="eyebrow">A shared starting point</p>
      <h1>
        A little place
        <br />
        for us.
      </h1>
      <p className="lede">
        Small apps for the things we do together.
        <br />
        One account. Familiar faces.
      </p>
      <Link className="button" href="/login">
        Sign in to mtn.lu <span aria-hidden="true">↗</span>
      </Link>
      <section className="directory" aria-labelledby="apps-title">
        <div className="section-heading">
          <h2 id="apps-title">Around here</h2>
          <span>01 / In the making</span>
        </div>
        <article className="app-card">
          <div className="app-symbol" aria-hidden="true">
            ♟
          </div>
          <div>
            <h3>Games</h3>
            <p>A place to get everyone around the table.</p>
            <span className="badge">Planned · Not available yet</span>
          </div>
        </article>
        <p className="quiet">
          An intentionally small corner of the internet, for friends.
        </p>
      </section>
    </>
  );
}
function Login() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => {
      setCooldown(cooldown - 1);
    }, 1000);
    return () => {
      window.clearTimeout(id);
    };
  }, [cooldown]);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const returnTo = new URLSearchParams(window.location.search).get(
        "returnTo",
      );
      await api("/api/auth/request-link", acceptedSchema, {
        email,
        ...(returnTo ? { returnTo } : {}),
      });
      setSent(true);
      setCooldown(60);
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && e.status === 429) setCooldown(900);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-page">
      <p className="eyebrow">Friends welcome</p>
      <h1>{sent ? "Check your email." : "Come on in."}</h1>
      <p className="lede">
        {sent
          ? "If this address has access, a sign-in link will arrive shortly. It expires in 15 minutes."
          : "Use your invited email address. We’ll send you a link, no password needed."}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        aria-busy={busy}
      >
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "login-error" : "email-note"}
        />
        <p id="email-note" className="hint">
          Access is by invitation. You can open your email on any device.
        </p>
        {error && (
          <p id="login-error" role="alert" className="error">
            {error}
          </p>
        )}
        <button disabled={busy || cooldown > 0}>
          {busy
            ? "Sending…"
            : cooldown > 0
              ? `Try again in ${String(cooldown)}s`
              : sent
                ? "Send another link"
                : "Email me a sign-in link"}
        </button>
        <p role="status" className="hint">
          {sent ? "Request accepted. Check your inbox and spam folder." : ""}
        </p>
      </form>
      <Link href="/">Back home</Link>
    </div>
  );
}
function readConfirmation() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const result = {
    token: params.get("token"),
    returnTo: params.get("returnTo"),
  };
  window.history.replaceState(null, "", window.location.pathname);
  return result;
}
function Confirm() {
  const [credential, setCredential] = useState(readConfirmation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    if (!credential.token) return;
    const body = {
      token: credential.token,
      ...(credential.returnTo ? { returnTo: credential.returnTo } : {}),
    };
    setCredential({ token: null, returnTo: null });
    setBusy(true);
    try {
      const result = await api("/api/auth/confirm", confirmedSchema, body);
      const url = new URL(result.returnTo);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error("Invalid destination");
      window.location.assign(url.href);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <div className="form-page">
      <p className="eyebrow">One more step</p>
      <h1>
        {credential.token || busy
          ? "Make yourself at home."
          : "Let’s try a new link."}
      </h1>
      {credential.token || busy ? (
        <>
          <p className="lede">Continuing signs you into an mtn.lu account.</p>
          <p>
            If you didn’t request this link, don’t continue. Close this page
            instead.
          </p>
          <button
            disabled={busy}
            onClick={() => {
              void confirm();
            }}
          >
            {busy ? "Signing in…" : "Continue"}
          </button>
          <p className="hint">
            For your privacy, the link has been removed from the address bar. If
            you refresh, reopen the email to continue.
          </p>
        </>
      ) : (
        <>
          <p role="alert" className="error">
            {error ||
              "No sign-in link is available. Reopen the email, or request a fresh link."}
          </p>
          <Link className="button" href="/login">
            Request a new link
          </Link>
        </>
      )}
    </div>
  );
}
type AccountState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      user: NonNullable<ReturnType<typeof meSchema.parse>["user"]>;
    };
function Account() {
  const [state, setState] = useState<AccountState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void api("/api/me", meSchema)
      .then((data) => {
        if (active)
          setState(
            data.user
              ? { status: "ready", user: data.user }
              : { status: "unauthenticated" },
          );
      })
      .catch((e: unknown) => {
        if (active)
          setState(
            e instanceof ApiError && e.status === 401
              ? { status: "unauthenticated" }
              : { status: "error", message: errorMessage(e) },
          );
      });
    return () => {
      active = false;
    };
  }, []);
  async function logout(all: boolean) {
    setBusy(true);
    setError("");
    try {
      await api(
        all ? "/api/auth/logout-all" : "/api/auth/logout",
        acceptedSchema,
        {},
      );
      window.location.assign("/login");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  switch (state.status) {
    case "loading":
      return <p role="status">Loading your account…</p>;
    case "unauthenticated":
      return (
        <div className="form-page">
          <h1>Your place is here.</h1>
          <p>Sign in to see your account.</p>
          <Link className="button" href="/login">
            Sign in
          </Link>
        </div>
      );
    case "error":
      return (
        <div>
          <h1>We’ll be right back.</h1>
          <p role="alert">{state.message}</p>
          <a className="button" href="/account">
            Try again
          </a>
        </div>
      );
    case "ready":
      return (
        <div className="form-page">
          <p className="eyebrow">Your account</p>
          <h1>Hello, {state.user.name || "friend"}.</h1>
          <dl className="account-details">
            <dt>Email address</dt>
            <dd>{state.user.email}</dd>
            <dt>Signed in until</dt>
            <dd>{new Date(state.user.expiresAt).toLocaleDateString()}</dd>
          </dl>
          <p className="hint">
            After 30 days, request a new link to sign in again.
          </p>
          <div className="actions">
            <button
              disabled={busy}
              onClick={() => {
                void logout(false);
              }}
            >
              Sign out here
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                void logout(true);
              }}
            >
              Sign out everywhere
            </button>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <p role="status">{busy ? "Signing out…" : ""}</p>
        </div>
      );
  }
}
function App() {
  const [location] = useLocation();
  const main = useRef<HTMLElement>(null);
  const previous = useRef(location);
  useEffect(() => {
    if (previous.current !== location) {
      main.current?.focus();
      previous.current = location;
    }
  }, [location]);
  return (
    <>
      <a href="#main" className="skip">
        Skip to content
      </a>
      <header>
        <Link href="/" className="wordmark" aria-label="mtn.lu home">
          <span className="mark" aria-hidden="true">
            m.
          </span>{" "}
          mtn.lu
        </Link>
        <nav aria-label="Main">
          <Link href="/account">
            Your account <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </header>
      <main id="main" tabIndex={-1} ref={main}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/login" component={Login} />
          <Route path="/login/confirm" component={Confirm} />
          <Route path="/account" component={Account} />
          <Route>
            <h1>A little off the path.</h1>
            <p>We couldn’t find that page.</p>
            <Link className="button" href="/">
              Back home
            </Link>
          </Route>
        </Switch>
      </main>
      <footer>
        <span>mtn.lu</span>
        <span>Made for a small circle.</span>
      </footer>
    </>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(<App />);

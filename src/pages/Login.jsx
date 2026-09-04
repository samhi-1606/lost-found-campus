import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import Logo from "../components/Logo";
import { auth, isFirebaseConfigured, FIREBASE_CONFIG_ERROR } from "../firebase/config";

function messageFor(error) {
  switch (error?.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That email and password combination doesn't match an account.";
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network problem. Check your connection and try again.";
    default:
      return "Could not log you in. Please try again.";
  }
}

export default function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;

    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");

    setError("");
    if (!isFirebaseConfigured) return setError(FIREBASE_CONFIG_ERROR);

    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-aside">
        <Logo />
        <div className="auth-quote"><span>“</span><h2>Sometimes finding something starts with simply asking.</h2><p>CampusFind keeps that asking private, organized and a little easier.</p></div>
      </div>
      <div className="auth-main">
        <Link to="/" className="back-link">← Back to home</Link>
        <div className="auth-box">
          <span className="eyebrow">WELCOME BACK</span><h1>Log in to CampusFind</h1><p className="muted">Use your college account to continue.</p>
          <form onSubmit={submit}>
            <label>College email<input name="email" type="email" placeholder="you@college.edu" required /></label>
            <label>Password<input name="password" type="password" placeholder="Enter your password" required /></label>
            {error && <div className="form-error">{error}</div>}
            <div className="form-row-between"><label className="check-label"><input type="checkbox" /> Remember me</label><a href="#forgot">Forgot password?</a></div>
            <button className="button button-primary full" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
          </form>
          <p className="auth-bottom">New to CampusFind? <Link to="/register">Create an account</Link></p>
        </div>
      </div>
    </div>
  );
}

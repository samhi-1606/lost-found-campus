import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, isFirebaseConfigured, FIREBASE_CONFIG_ERROR } from "../firebase/config";

function messageFor(error) {
  switch (error?.code) {
    case "auth/email-already-in-use":
      return "That email already has an account. Try logging in instead.";
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/weak-password":
      return "Please choose a password with at least 6 characters.";
    case "auth/network-request-failed":
      return "Network problem. Check your connection and try again.";
    default:
      return "Could not create your account. Please try again.";
  }
}

export default function Register() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;

    const form = new FormData(e.currentTarget);
    const fullName = String(form.get("fullName") || "").trim();
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");

    setError("");
    if (!isFirebaseConfigured) return setError(FIREBASE_CONFIG_ERROR);
    if (password !== confirmPassword) return setError("Those passwords don't match.");

    setBusy(true);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      if (fullName) await updateProfile(user, { displayName: fullName });
      navigate("/dashboard");
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-aside">
        <div className="logo"><span className="logo-mark">C</span><span><strong>Campus</strong>Find</span></div>
        <div className="auth-quote"><span>+</span><h2>Good campus communities look out for each other.</h2><p>Report what you lost. Report what you found. Let the right people connect.</p></div>
      </div>
      <div className="auth-main">
        <Link to="/" className="back-link">← Back to home</Link>
        <div className="auth-box">
          <span className="eyebrow">GET STARTED</span><h1>Create your account</h1><p className="muted">A college email keeps the community campus-specific.</p>
          <form onSubmit={submit}>
            <div className="two-col"><label>Full name<input name="fullName" required placeholder="Alex Morgan" /></label><label>Student ID<input name="studentId" required placeholder="STU-20481" /></label></div>
            <label>College email<input name="email" type="email" required placeholder="you@college.edu" /></label>
            <div className="two-col"><label>Password<input name="password" type="password" required placeholder="At least 8 characters" /></label><label>Confirm password<input name="confirmPassword" type="password" required placeholder="Repeat password" /></label></div>
            <label className="check-label"><input type="checkbox" required /> I agree to use CampusFind respectfully and honestly.</label>
            {error && <div className="form-error">{error}</div>}
            <button className="button button-primary full" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
          </form>
          <p className="auth-bottom">Already have an account? <Link to="/login">Log in</Link></p>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import Icon from "../components/Icon";
import { auth, db, isFirebaseConfigured, FIREBASE_CONFIG_ERROR } from "../firebase/config";

// Unsigned Cloudinary upload: cloud name + unsigned preset are public values.
// The Cloudinary API secret must never reach the browser and is not used here.
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

/** Uploads one image and returns its secure_url, throwing on any failure. */
async function uploadToCloudinary(file) {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to .env.local."
    );
  }

  const body = new FormData();
  body.append("file", file);
  body.append("upload_preset", UPLOAD_PRESET);

  let response;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body });
  } catch {
    throw new Error("Could not reach Cloudinary. Check your connection and try again.");
  }

  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.secure_url) {
    throw new Error(result?.error?.message ? `Image upload failed: ${result.error.message}` : "Image upload failed. Please try again.");
  }
  return result.secure_url;
}

export default function ReportForm({ mode }) {
  const lost = mode === "lost";
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Firebase restores a persisted session asynchronously, so wait for the first
  // callback before deciding whether someone is signed in.
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return; // blocks a second submit while the request is in flight

    const form = new FormData(e.currentTarget);

    setError("");
    if (!isFirebaseConfigured) return setError(FIREBASE_CONFIG_ERROR);
    if (!authReady) return setError("Still checking your session — please try again in a moment.");
    if (!user) return setError("You need to be logged in to submit a report.");

    setBusy(true);
    try {
      // Upload first: a failed upload must never produce a report that carries
      // a placeholder image URL.
      const imageUrl = file ? await uploadToCloudinary(file) : null;

      await addDoc(collection(db, "reports"), {
        userId: user.uid,
        type: lost ? "lost" : "found",
        title: String(form.get("title") || "").trim(),
        description: String(form.get("description") || "").trim(),
        category: String(form.get("category") || ""),
        locationText: String(form.get("locationText") || ""),
        date: String(form.get("date") || ""),
        time: String(form.get("time") || ""),
        imageUrl,
        status: "open",
        createdAt: serverTimestamp(),
        aiStatus: "pending",
      });

      setSubmitted(true);
    } catch (err) {
      setError(err?.message || "Could not submit your report. Please try again.");
      setBusy(false);
    }
  };

  if (submitted) {
    return <div className="center-state"><div className="success-circle">✓</div><span className="eyebrow">REPORT RECEIVED</span><h1>Thank you for looking out.</h1><p>Your {lost ? "lost" : "found"} item report is ready. The next step will be AI-assisted analysis once the backend is connected.</p><div className="button-row"><Link className="button button-primary" to="/ai-analysis">View analysis</Link><Link className="button button-outline" to="/dashboard">Back to dashboard</Link></div></div>;
  }

  return (
    <>
      <div className="page-heading narrow"><div><Link to="/dashboard" className="back-link">← Dashboard</Link><span className="eyebrow">{lost ? "LOST ITEM" : "FOUND ITEM"}</span><h1>{lost ? "Tell us what went missing." : "You found something. Thank you."}</h1><p>{lost ? "Share the details you remember. You can always update a report later." : "Give us enough information to help the owner, while keeping sensitive details private."}</p></div></div>
      <form className="form-layout" onSubmit={submit}>
        <section className="form-section">
          <div className="form-section-heading"><span className="section-number">01</span><div><h2>Item basics</h2><p>The details that help us understand the object.</p></div></div>
          <div className="form-grid"><label>Item name<input name="title" required placeholder={lost ? "e.g. Navy blue backpack" : "e.g. Silver water bottle"} /></label><label>Category<select name="category" required><option value="">Choose a category</option><option>Bags</option><option>Electronics</option><option>Books</option><option>Bottles</option><option>Clothing</option><option>Keys</option><option>Other</option></select></label><label className="wide">Description<textarea name="description" required rows="4" placeholder="What does it look and feel like?"></textarea></label></div>
        </section>

        <section className="form-section">
          <div className="form-section-heading"><span className="section-number">02</span><div><h2>Item characteristics</h2><p>Small details can make a big difference when comparing reports.</p></div></div>
          <div className="form-grid"><label>Color<input placeholder="e.g. Navy blue" /></label><label>Brand<input placeholder="e.g. Nike" /></label><label>Model<input placeholder="If known" /></label><label>Material<input placeholder="e.g. Canvas" /></label><label>Shape<input placeholder="e.g. Rectangular" /></label><label>Size<input placeholder="e.g. Medium" /></label><label className="wide">Unique identifying marks<textarea rows="3" placeholder="Stickers, scratches, embroidery, engraving..."></textarea></label><label className="wide">Text or engraving<textarea rows="2" placeholder="Any visible words, initials or numbers"></textarea></label></div>
        </section>

        <section className="form-section">
          <div className="form-section-heading"><span className="section-number">03</span><div><h2>{lost ? "Where and when?" : "Where and when did you find it?"}</h2><p>Approximate information is completely okay.</p></div></div>
          <div className="form-grid"><label>Date<input name="date" type="date" required /></label><label>Approximate time<input name="time" type="time" /></label><label>Campus location<select name="locationText" required><option value="">Choose a location</option><option>Central Library</option><option>Engineering Block</option><option>Canteen</option><option>Main Gate</option><option>Hostel</option><option>Auditorium</option><option>Sports Ground</option><option>Other</option></select></label><label>Nearby landmark<input placeholder="e.g. Library steps" /></label></div>
        </section>

        <section className="form-section">
          <div className="form-section-heading"><span className="section-number">04</span><div><h2>Photo</h2><p>A clear photo can help AI-assisted matching later.</p></div></div>
          <label className="upload-box">{file ? <><div className="upload-preview">🖼️</div><strong>{file.name}</strong><small>Click to change the image</small></> : <><Icon name="upload" size={28} /><strong>Drop a photo here, or click to browse</strong><small>JPG, PNG up to 10 MB</small></>}<input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
          <div className="privacy-inline"><Icon name="lock" size={16} /><span>Photos and identifying details are intended for the private matching and verification flow.</span></div>
        </section>

        {authReady && !user && <div className="form-error">You need to be logged in to submit a report. <Link to="/login">Log in</Link></div>}
        {error && <div className="form-error">{error}</div>}
        <div className="form-submit"><Link to="/dashboard" className="button button-outline">Save for later</Link><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Submitting…" : <>{lost ? "Submit lost report" : "Submit found report"} <Icon name="arrow" size={17} /></>}</button></div>
      </form>
    </>
  );
}

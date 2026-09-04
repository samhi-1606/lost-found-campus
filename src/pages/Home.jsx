import { Link } from "react-router-dom";
import Logo from "../components/Logo";
import Icon from "../components/Icon";

export default function Home() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Logo />
        <nav>
          <a href="#how">How it works</a>
          <a href="#privacy">Privacy</a>
          <Link to="/login" className="text-link">Log in</Link>
          <Link to="/register" className="button button-small">Join CampusFind</Link>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="soft-pill">Made for campus life</span>
          <h1>Lost something?<br /><em>Let’s bring it home.</em></h1>
          <p>CampusFind helps students report lost and found items, discover thoughtful matches, and arrange a safe handover — without putting private item details on a public board.</p>
          <div className="hero-actions">
            <Link to="/report-lost" className="button button-primary">I lost something <Icon name="arrow" size={18} /></Link>
            <Link to="/report-found" className="button button-outline">I found something</Link>
          </div>
          <div className="trust-line"><span>●</span> Private by design <span>·</span> Student-friendly <span>·</span> Security-aware</div>
        </div>

        <div className="hero-art">
          <div className="desk-card card-back">FOUND<br /><small>Someone may be looking for this.</small></div>
          <div className="desk-card card-front">
            <div className="card-photo">🎒</div>
            <div className="mini-label">POTENTIAL MATCH</div>
            <h3>Navy backpack</h3>
            <div className="match-row"><span>91% match</span><span>Central Library</span></div>
          </div>
          <div className="handwritten">A little easier,<br />a little kinder.</div>
        </div>
      </section>

      <section className="feature-strip">
        <div><span>01</span><strong>Describe it naturally</strong><p>Tell us what you remember — details, place, time and photos.</p></div>
        <div><span>02</span><strong>Let AI help search</strong><p>Potential matches are ranked from useful signals, not guesswork alone.</p></div>
        <div><span>03</span><strong>Verify before sharing</strong><p>Private details stay protected until ownership is reasonably verified.</p></div>
      </section>

      <section id="how" className="section how-section">
        <div className="section-intro"><span className="eyebrow">HOW IT WORKS</span><h2>A calmer way to find what went missing.</h2><p>CampusFind turns a stressful “has anyone seen this?” moment into a clear, private process.</p></div>
        <div className="how-grid">
          <div className="how-card"><div className="step-number">1</div><h3>Report</h3><p>Add what you know, upload a photo if you have one, and point us to the campus location.</p></div>
          <div className="how-card"><div className="step-number">2</div><h3>Match</h3><p>AI-assisted analysis compares useful attributes and surfaces promising possibilities.</p></div>
          <div className="how-card"><div className="step-number">3</div><h3>Verify</h3><p>Answer private questions about details that a stranger would be unlikely to know.</p></div>
          <div className="how-card"><div className="step-number">4</div><h3>Reunite</h3><p>Meet at a monitored campus spot, then confirm the handover with a one-time code when you’re both there.</p></div>
        </div>
      </section>

      <section id="privacy" className="privacy-banner">
        <div className="privacy-mark"><Icon name="lock" size={28} /></div>
        <div><span className="eyebrow">PRIVACY FIRST</span><h2>Not every detail needs to be public.</h2><p>CampusFind is designed around the idea that a found item should not become a public catalogue of everything inside it. Sensitive details are reserved for verification.</p></div>
      </section>

      <footer className="landing-footer"><Logo /><span>Built for students, with a little more care.</span><span>© 2026 CampusFind</span></footer>
    </div>
  );
}
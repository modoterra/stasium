import "./site-app.css";

function SiteApp() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Stasium</p>
        <h1>Run every local service from one terminal.</h1>
        <p className="lede">
          Stasium reads your project manifest, starts services in dependency order, streams logs
          into a focused TUI, and tears down process groups cleanly.
        </p>
        <div className="actions">
          <a href="https://github.com/modoterra/stasium/releases/latest">Install Stasium</a>
          <a href="https://github.com/modoterra/stasium">View source</a>
        </div>
      </section>

      <section className="cards" aria-label="Highlights">
        <article>
          <span>01</span>
          <h2>Manifest first</h2>
          <p>Describe apps, services, dependencies, and Docker helpers in stasium.toml.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Discovery built in</h2>
          <p>Detect common project services and add selected entries without leaving the TUI.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Clean shutdown</h2>
          <p>Stop spawned services and descendants predictably when the workspace exits.</p>
        </article>
      </section>
    </main>
  );
}

export default SiteApp;

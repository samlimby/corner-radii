import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { InlineSlider } from "@/components/motion/range-slider-inline";
import { DEFAULT_VALUES, RADIUS_STOPS, nextValues, needsExpandedPreview, previewScale } from "@/lib/radius";

function storedValue(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function commitLayoutTransition(update) {
  if (prefersReducedMotion() || !document.startViewTransition) {
    if (prefersReducedMotion()) {
      update();
      return;
    }

    const selectors = [".example", ".radius-controls"];
    const before = selectors.map((selector) =>
      document.querySelector(selector)?.getBoundingClientRect(),
    );
    flushSync(update);
    selectors.forEach((selector, index) => {
      const element = document.querySelector(selector);
      const previous = before[index];
      if (!element || !previous) return;
      const next = element.getBoundingClientRect();
      const fromTransform = `translate(${previous.left - next.left}px, ${previous.top - next.top}px) scale(${previous.width / next.width}, ${previous.height / next.height})`;
      if (typeof element.animate === "function") {
        const animation = element.animate([
          { transform: fromTransform, transformOrigin: "top left" },
          { transform: "none", transformOrigin: "top left" },
        ], {
          duration: 420,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "both",
        });
        animation.finished.then(() => animation.cancel(), () => {});
        return;
      }

      element.style.setProperty("--layout-from-transform", fromTransform);
      element.classList.remove("is-layout-transitioning");
      void element.offsetWidth;
      element.classList.add("is-layout-transitioning");
      clearTimeout(element._layoutTransitionTimer);
      element._layoutTransitionTimer = setTimeout(() => {
        element.classList.remove("is-layout-transitioning");
        element.style.removeProperty("--layout-from-transform");
      }, 440);
    });
    return;
  }

  document.startViewTransition(() => flushSync(update));
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Some browsers deny the async API while allowing selection-based copy.
    }
  }

  const previousFocus = document.activeElement;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  try {
    textarea.select();
    if (!document.execCommand("copy")) throw new Error("Unable to copy email address");
  } finally {
    textarea.remove();
    previousFocus?.focus({ preventScroll: true });
  }
}

function ThemeToggle({ theme, onToggle }) {
  const dark = theme === "dark";
  const nextTheme = dark ? "light" : "dark";

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={`Switch to ${nextTheme} mode`}
      aria-pressed={dark}
      title={`Switch to ${nextTheme} mode`}
      onClick={onToggle}
    >
      {/* Font Awesome Free 6.7.2, CC BY 4.0 */}
      <svg className="theme-toggle__icon theme-toggle__sun" aria-hidden="true" viewBox="0 0 512 512">
        <path d="M361.5 1.2c5 2.1 8.6 6.6 9.6 11.9L391 121l107.9 19.8c5.3 1 9.8 4.6 11.9 9.6s1.5 10.7-1.6 15.2L446.9 256l62.3 90.3c3.1 4.5 3.7 10.2 1.6 15.2s-6.6 8.6-11.9 9.6L391 391 371.1 498.9c-1 5.3-4.6 9.8-9.6 11.9s-10.7 1.5-15.2-1.6L256 446.9l-90.3 62.3c-4.5 3.1-10.2 3.7-15.2 1.6s-8.6-6.6-9.6-11.9L121 391 13.1 371.1c-5.3-1-9.8-4.6-11.9-9.6s-1.5-10.7 1.6-15.2L65.1 256 2.8 165.7c-3.1-4.5-3.7-10.2-1.6-15.2s6.6-8.6 11.9-9.6L121 121 140.9 13.1c1-5.3 4.6-9.8 9.6-11.9s10.7-1.5 15.2 1.6L256 65.1 346.3 2.8c4.5-3.1 10.2-3.7 15.2-1.6zM160 256a96 96 0 1 1 192 0 96 96 0 1 1 -192 0zm224 0a128 128 0 1 0 -256 0 128 128 0 1 0 256 0z" />
      </svg>
      <svg className="theme-toggle__icon theme-toggle__moon" aria-hidden="true" viewBox="0 0 384 512">
        <path d="M223.5 32C100 32 0 132.3 0 256S100 480 223.5 480c60.6 0 115.5-24.2 155.8-63.4c5-4.9 6.3-12.5 3.1-18.7s-10.1-9.7-17-8.5c-9.8 1.7-19.8 2.6-30.1 2.6c-96.9 0-175.5-78.8-175.5-176c0-65.8 36-123.1 89.3-153.3c6.1-3.5 9.2-10.5 7.7-17.3s-7.3-11.9-14.3-12.5c-6.3-.5-12.6-.8-19-.8z" />
      </svg>
    </button>
  );
}

function CardExample({ outer, inner, padding, size, redlines, expanded, onRedlinesChange }) {
  const stageRef = useRef(null);
  const [stageSize, setStageSize] = useState({ width: 480, height: 480 });
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const measure = () => {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      setStageSize(previous => previous.width === width && previous.height === height
        ? previous : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);
  const scale = previewScale({ size, padding }, stageSize.width, stageSize.height, redlines, expanded);
  const drawingStyle = {
    '--outer-radius': `${outer * scale}px`,
    '--inner-radius': `${inner * scale}px`,
    '--gap': `${padding * scale}px`,
    '--card-width': `${size * scale}px`,
    '--card-height': `${size * scale}px`,
  };
  return (
    <section className="example" aria-labelledby="example-title">
      <div className="example__header">
        <h2 id="example-title">Card Example</h2>
        <label className="redline-toggle">
          <span>Redlines</span>
          <input
            className="redline-toggle__input"
            type="checkbox"
            checked={redlines}
            onChange={(event) => onRedlinesChange(event.currentTarget.checked)}
          />
          <span className="redline-toggle__switch" aria-hidden="true" />
        </label>
      </div>
      <div className="example__stage" ref={stageRef}>
        <div className="example-card" style={drawingStyle}>
          <div className="example-card__content" />
          <div className="measure measure--inner-radius" aria-hidden="true">
            <output>R {inner}</output>
          </div>
          <div className="measure measure--outer-radius" aria-hidden="true">
            <output>R {outer}</output>
          </div>
          <div className="measure measure--left-top" aria-hidden="true"><output>{padding}</output></div>
          <div className="measure measure--left-bottom" aria-hidden="true"><output>{padding}</output></div>
          <div className="measure measure--width" aria-hidden="true"><output>{size}</output></div>
          <div className="measure measure--height" aria-hidden="true"><output>{size}</output></div>
        </div>
      </div>
    </section>
  );
}

function CalculationDisclosure({ outer, padding, inner }) {
  const disclosureRef = useRef(null);
  const bodyRef = useRef(null);
  const targetOpenRef = useRef(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const disclosure = disclosureRef.current;
    return () => {
      disclosure._heightAnimation?.cancel();
      disclosure._bodyAnimation?.cancel();
    };
  }, []);

  const toggleDisclosure = (event) => {
    event.preventDefault();
    const disclosure = disclosureRef.current;
    const body = bodyRef.current;
    const opening = !targetOpenRef.current;
    targetOpenRef.current = opening;
    const startHeight = disclosure.getBoundingClientRect().height;
    disclosure._heightAnimation?.cancel();
    disclosure._bodyAnimation?.cancel();

    if (prefersReducedMotion() || typeof disclosure.animate !== "function") {
      disclosure.open = opening;
      disclosure.style.height = "";
      disclosure.style.overflow = "";
      setClosing(false);
      return;
    }

    if (opening) disclosure.open = true;
    setClosing(!opening);

    const endHeight = disclosure.querySelector("summary").offsetHeight + (opening ? body.offsetHeight : 0);
    const bounce = opening ? 8 : -8;
    disclosure.style.height = `${startHeight}px`;
    disclosure.style.overflow = "hidden";

    disclosure._heightAnimation = disclosure.animate([
      { height: `${startHeight}px` },
      { height: `${endHeight + bounce}px`, offset: 0.58 },
      { height: `${endHeight - bounce * 0.42}px`, offset: 0.78 },
      { height: `${endHeight + bounce * 0.16}px`, offset: 0.92 },
      { height: `${endHeight}px` },
    ], { duration: 360, easing: "linear" });

    disclosure._bodyAnimation = body.animate(
      opening
        ? [
            { opacity: 0, transform: "translateY(-8px) scaleY(0.96)" },
            { opacity: 1, transform: "translateY(2px) scaleY(1.02)", offset: 0.68 },
            { opacity: 1, transform: "translateY(0) scaleY(1)" },
          ]
        : [
            { opacity: 1, transform: "translateY(0) scaleY(1)" },
            { opacity: 0, transform: "translateY(-6px) scaleY(0.96)" },
          ],
      { duration: opening ? 260 : 180, easing: opening ? "cubic-bezier(0.2, 0.9, 0.25, 1.15)" : "ease-in", fill: "both" },
    );

    disclosure._heightAnimation.onfinish = () => {
      disclosure.open = opening;
      disclosure.style.height = "";
      disclosure.style.overflow = "";
      disclosure._bodyAnimation?.cancel();
      setClosing(false);
    };
  };

  return (
    <details ref={disclosureRef} className={`calculation-disclosure${closing ? " is-closing" : ""}`}>
      <summary onClick={toggleDisclosure}>
        <span>Calculation</span>
        <svg aria-hidden="true" className="calculation-disclosure__chevron" viewBox="0 0 16 16" width="16" height="16">
          <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
        </svg>
      </summary>
      <div ref={bodyRef} className="calculation-disclosure__body">
        <span className="calculation-disclosure__label">Inner radius</span>
        <output className="calculation-disclosure__equation">
          {padding > outer ? `max(0, ${outer} − ${padding})` : `R ${outer} − ${padding}`} = R {inner}
        </output>
        {padding > outer && <p className="calculation-disclosure__label">Padding exceeds the outer radius, so the inner corner is square.</p>}
        <code>max(0px, calc({outer}px - {padding}px))</code>
      </div>
    </details>
  );
}

export default function App() {
  const [theme, setTheme] = useState(() =>
    ["light", "dark"].includes(storedValue("corner-radii-theme", ""))
      ? storedValue("corner-radii-theme", "light")
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  const [redlines, setRedlines] = useState(() => storedValue("corner-radii-redlines", "off") === "on");
  const [values, setValues] = useState(DEFAULT_VALUES);
  const valuesRef = useRef(DEFAULT_VALUES);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [feedbackCopied, setFeedbackCopied] = useState(false);
  const [feedbackError, setFeedbackError] = useState(false);
  const feedbackResetRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.redlines = redlines ? "on" : "off";
    try {
      localStorage.setItem("corner-radii-redlines", redlines ? "on" : "off");
    } catch {}
  }, [redlines]);

  useEffect(() => () => clearTimeout(feedbackResetRef.current), []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("corner-radii-theme", next);
    } catch {}
  };

  const updateValue = (name, value) => {
    const next = nextValues(valuesRef.current, name, value);
    valuesRef.current = next;
    setValues(next);
  };

  const commitSliderValue = (name, value) => {
    const next = nextValues(valuesRef.current, name, value);
    valuesRef.current = next;
    setValues(next);

    const nextExpanded = needsExpandedPreview(next, redlines);
    if (nextExpanded === previewExpanded) return;
    commitLayoutTransition(() => setPreviewExpanded(nextExpanded));
  };

  const updateRedlines = (nextRedlines) => {
    const nextExpanded = needsExpandedPreview(valuesRef.current, nextRedlines);
    const commit = () => {
      setRedlines(nextRedlines);
      setPreviewExpanded(nextExpanded);
    };
    if (nextExpanded !== previewExpanded) commitLayoutTransition(commit);
    else commit();
  };

  const copyFeedbackEmail = async () => {
    clearTimeout(feedbackResetRef.current);
    setFeedbackError(false);
    try {
      await copyText("samlimby2@gmail.com");
      setFeedbackCopied(true);
      clearTimeout(feedbackResetRef.current);
      feedbackResetRef.current = setTimeout(() => setFeedbackCopied(false), 1600);
    } catch {
      setFeedbackCopied(false);
      setFeedbackError(true);
    }
  };

  const { outer, inner, padding, size } = values;
  const workspaceStyle = {
    "--outer-radius": `${outer}px`,
    "--inner-radius": `${inner}px`,
    "--gap": `${padding}px`,
    "--card-width": `${size}px`,
    "--card-height": `${size}px`,
  };

  return (
    <>
      <ThemeToggle theme={theme} onToggle={toggleTheme} />
      <main className={`workspace${previewExpanded ? " is-preview-expanded" : ""}`} style={workspaceStyle}>
        <header className="project-meta">
          <div className="project-meta__copy">
            <h1>Corner Radii</h1>
            <p>A tool to calculate perfect nested border radius</p>
          </div>
          <p className="project-meta__author">
            <a href="https://www.samlimby.com">Sam Limby</a>
          </p>
        </header>

        <CardExample {...values} redlines={redlines} expanded={previewExpanded} onRedlinesChange={updateRedlines} />

        <section className="radius-controls" aria-labelledby="controls-title">
          <h2 id="controls-title">Radius Controls</h2>
          <form className="controls-panel" onSubmit={(event) => event.preventDefault()}>
            <InlineSlider className="range-control" label="Outer" value={outer} min={0} max={48} step={4} stops={RADIUS_STOPS} onValueChange={(value) => updateValue("outer", value)} onValueCommit={(value) => commitSliderValue("outer", value)} />
            <InlineSlider className="range-control" label="Inner" value={inner} min={0} max={48} step={4} stops={RADIUS_STOPS} onValueChange={(value) => updateValue("inner", value)} onValueCommit={(value) => commitSliderValue("inner", value)} />
            <div className="controls-panel__divider" aria-hidden="true">
              <span>Sizing</span>
              <span className="controls-panel__rule" />
            </div>
            <InlineSlider className="range-control" label="Padding" value={padding} min={0} max={100} step={4} onValueChange={(value) => updateValue("padding", value)} onValueCommit={(value) => commitSliderValue("padding", value)} />
            <InlineSlider className="range-control" label="Size" value={size} min={160} max={360} step={4} onValueChange={(value) => updateValue("size", value)} onValueCommit={(value) => commitSliderValue("size", value)} />
          </form>
          <CalculationDisclosure outer={outer} padding={padding} inner={inner} />
        </section>

        <p className="sr-only" aria-live="polite">
          Inner radius {inner} pixels, calculated as outer radius {outer} pixels minus padding {padding} pixels, with a minimum of zero.
        </p>

        <footer className="site-footer">
          <p className="site-footer__author">
            <a href="https://www.samlimby.com">Made by Sam Limby</a>
          </p>
          <p className="site-footer__meta">
            <button
              className="site-footer__feedback"
              type="button"
              aria-label="Copy feedback email address samlimby2@gmail.com"
              onClick={copyFeedbackEmail}
            >
              <span aria-live="polite">{feedbackCopied ? "Email changed!" : "Feedback"}</span>
            </button>
            <span className="site-footer__separator" aria-hidden="true">•</span>
            <span>Updated Sep 2026</span>
          </p>
          {feedbackError && <p role="status">Couldn’t copy. Email: samlimby2@gmail.com</p>}
        </footer>
      </main>
    </>
  );
}

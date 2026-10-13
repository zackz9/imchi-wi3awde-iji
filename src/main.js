import {
  animate,
  clamp,
  cubicBezier,
  frame,
  mapValue,
  motionValue,
  resize,
  scroll,
  springValue,
  styleEffect,
  transformValue,
} from 'motion';

const INK = '#171717';
const PAPER = '#f2efe7';
const EASE_OUT = [0.23, 1, 0.32, 1];
const easeInOut = cubicBezier(0.77, 0, 0.175, 1);

// Scroll choreography, as fractions of the pinned runway.
const MORPH_START = 0.04;
const MORPH_END = 0.92;
const WORD_STAGGER = 0.06;
const GLYPH_SPREAD = 0.03;
const MORPH_DURATION = MORPH_END - MORPH_START - 2 * WORD_STAGGER - GLYPH_SPREAD;
const ARC = 0.08;

// Pointer wave: letters near the cursor lift (em) and lean away (deg).
const LIFT = 0.045;
const LEAN = 4;
const SUN_DRIFT = 10;

// springValue takes duration in ms; it skips animate()'s seconds conversion.
const SCROLL_SPRING = { duration: 500, bounce: 0 };
const HOVER_SPRING = { duration: 500, bounce: 0.2 };

const root = document.documentElement;
const experience = document.querySelector('.experience');
const scene = experience.querySelector('.scene--expression');
const ghostScene = experience.querySelector('.scene--recomposition');
const phrase = scene.querySelector('.phrase');
const ink = scene.querySelector('.scene__ink');
const sun = scene.querySelector('.scene__sun');
const ghostSun = ghostScene.querySelector('.scene__sun');
const words = [...phrase.querySelectorAll('.phrase__word')];
const ghostWords = [...ghostScene.querySelectorAll('.phrase__word')];
const originalWords = words.map((word) => word.innerHTML);
const themeColor = document.querySelector('meta[name="theme-color"]');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

const center = (element) => ({
  x: element.offsetLeft + element.offsetWidth / 2,
  y: element.offsetTop + element.offsetHeight / 2,
});

// Bow a straight path outward, away from the composition's centre.
const arcNormal = (from, to, middle) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const midX = (from.x + to.x) / 2 - middle.x;
  const midY = (from.y + to.y) / 2 - middle.y;
  const outward = Math.sign(-dy * midX + dx * midY) || 1;
  return { nx: -dy * outward, ny: dx * outward };
};

const splitWord = (word) => {
  word.setAttribute('aria-hidden', 'true');
  const glyphs = [...word.textContent].map((character) => {
    const glyph = document.createElement('span');
    glyph.className = 'phrase__glyph';
    if (character === '3') glyph.dataset.glyph = '3';

    const face = document.createElement('span');
    face.className = 'phrase__glyph-face';
    face.textContent = character;
    glyph.append(face);
    return glyph;
  });
  word.replaceChildren(...glyphs);
  return glyphs;
};

function start() {
  let cancelled = false;
  const cleanups = [];
  const values = [];
  const track = (value) => {
    values.push(value);
    return value;
  };

  root.classList.add('has-motion');

  const rawProgress = track(motionValue(0));
  const progress = track(springValue(rawProgress, SCROLL_SPRING));
  const geometry = track(motionValue(null));

  const glyphs = words.flatMap((word, wordIndex) =>
    splitWord(word).map((el) => ({
      el,
      face: el.firstElementChild,
      wordIndex,
      introY: track(motionValue(0.32)),
      introOpacity: track(motionValue(0)),
      liftTarget: track(motionValue(0)),
      leanTarget: track(motionValue(0)),
    })),
  );

  const sunIntroY = track(motionValue(6));
  const sunIntroScale = track(motionValue(0.94));
  const sunOpacity = track(motionValue(0));
  const sunDriftX = track(motionValue(0));
  const sunDriftY = track(motionValue(0));
  const sunX = track(springValue(sunDriftX, HOVER_SPRING));
  const sunY = track(springValue(sunDriftY, HOVER_SPRING));

  const measure = () => {
    const phraseMiddle = { x: phrase.offsetWidth / 2, y: phrase.offsetHeight / 2 };

    const wordPaths = words.map((word, index) => {
      const ghost = ghostWords[index];
      const from = getComputedStyle(word);
      const to = getComputedStyle(ghost);
      const matrix = new DOMMatrixReadOnly(to.transform === 'none' ? undefined : to.transform);
      const [ox, oy] = to.transformOrigin.split(' ').map(parseFloat);
      const dx = ghost.offsetLeft - word.offsetLeft;
      const dy = ghost.offsetTop - word.offsetTop;

      return {
        dx,
        dy,
        ox,
        oy,
        angle: (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI,
        scale: parseFloat(to.fontSize) / parseFloat(from.fontSize),
        ...arcNormal(center(word), center(ghost), phraseMiddle),
      };
    });

    // Letters at the front of each journey leave a beat before the ones behind them.
    const starts = new Map();
    wordPaths.forEach(({ dx, dy }, index) => {
      const length = Math.hypot(dx, dy) || 1;
      const wordGlyphs = glyphs.filter((glyph) => glyph.wordIndex === index);
      const reach = wordGlyphs.map(({ el }) => (
        ((el.offsetLeft + el.offsetWidth / 2) * dx + (el.offsetTop + el.offsetHeight / 2) * dy) / length
      ));
      const nearest = Math.min(...reach);
      const span = Math.max(...reach) - nearest || 1;
      wordGlyphs.forEach((glyph, i) => {
        const lag = 1 - (reach[i] - nearest) / span;
        starts.set(glyph, MORPH_START + index * WORD_STAGGER + lag * GLYPH_SPREAD);
      });
    });

    const sunFrom = center(sun);
    const sunTo = center(ghostSun);
    const sceneMiddle = { x: scene.offsetWidth / 2, y: scene.offsetHeight / 2 };

    glyphs.forEach(({ el }) => {
      el.style.transformOrigin = `${-el.offsetLeft}px ${-el.offsetTop}px`;
    });

    return {
      words: wordPaths,
      starts,
      sun: {
        dx: sunTo.x - sunFrom.x,
        dy: sunTo.y - sunFrom.y,
        scale: ghostSun.offsetWidth / sun.offsetWidth,
        ...arcNormal(sunFrom, sunTo, sceneMiddle),
      },
    };
  };

  const setup = () => {
    geometry.set(measure());

    glyphs.forEach((glyph) => {
      const lift = track(springValue(glyph.liftTarget, HOVER_SPRING));
      const lean = track(springValue(glyph.leanTarget, HOVER_SPRING));

      const travel = track(transformValue(() => {
        const p = progress.get();
        const layout = geometry.get();
        const path = layout.words[glyph.wordIndex];
        const t = easeInOut(clamp(0, 1, (p - layout.starts.get(glyph)) / MORPH_DURATION));
        const bow = Math.sin(Math.PI * t) * ARC;
        const x = path.dx * t + path.nx * bow;
        const y = path.dy * t + path.ny * bow;
        return `translate(${x}px, ${y}px) translate(${path.ox}px, ${path.oy}px) rotate(${path.angle * t}deg) translate(${-path.ox}px, ${-path.oy}px) scale(${1 + (path.scale - 1) * t})`;
      }));

      const pose = track(transformValue(
        () => `translateY(${glyph.introY.get() + lift.get()}em) rotate(${lean.get()}deg)`,
      ));

      cleanups.push(
        styleEffect(glyph.el, { transform: travel }),
        styleEffect(glyph.face, { transform: pose, opacity: glyph.introOpacity }),
      );
    });

    // The sun rides the same arc as "iji", which sits on it in both compositions.
    const sunStart = MORPH_START + 2 * WORD_STAGGER + GLYPH_SPREAD / 2;
    const sunTransform = track(transformValue(() => {
      const p = progress.get();
      const path = geometry.get().sun;
      const t = easeInOut(clamp(0, 1, (p - sunStart) / MORPH_DURATION));
      const bow = Math.sin(Math.PI * t) * ARC;
      const x = path.dx * t + path.nx * bow + sunX.get();
      const y = path.dy * t + path.ny * bow + sunY.get();
      const scale = (1 + (path.scale - 1) * t) * sunIntroScale.get();
      return `translate(${x}px, ${y}px) translateY(${sunIntroY.get()}%) scale(${scale})`;
    }));

    // Night falls mid-journey: the words dissolve into it and return in paper.
    cleanups.push(
      styleEffect(sun, { transform: sunTransform, opacity: sunOpacity }),
      styleEffect(ink, { opacity: track(mapValue(progress, [0.32, 0.6], [0, 1])) }),
      styleEffect(phrase, { color: track(mapValue(progress, [0.42, 0.62], [INK, PAPER])) }),
    );

    let isNight = false;
    cleanups.push(progress.on('change', (p) => {
      if (p > 0.5 === isNight) return;
      isNight = !isNight;
      root.classList.toggle('is-night', isNight);
      themeColor.content = isNight ? INK : PAPER;
    }));

    cleanups.push(
      scroll((p) => rawProgress.set(p), { target: experience }),
      resize(() => geometry.set(measure())),
    );

    if (finePointer.matches) cleanups.push(bindPointer());

    // Lift the CSS guard only once Motion has written the hidden intro state.
    frame.postRender(() => {
      if (cancelled) return;
      root.classList.add('is-ready');
      playIntro();
    });
  };

  const bindPointer = () => {
    const pointer = { x: 0, y: 0, inside: false };
    let scheduled = false;

    const wave = () => {
      scheduled = false;
      glyphs.forEach(({ el, liftTarget, leanTarget }) => {
        if (!pointer.inside) {
          liftTarget.set(0);
          leanTarget.set(0);
          return;
        }
        const rect = el.getBoundingClientRect();
        const sigma = Math.max(rect.width, rect.height) * 0.75;
        const dx = rect.left + rect.width / 2 - pointer.x;
        const dy = rect.top + rect.height / 2 - pointer.y;
        const influence = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
        liftTarget.set(-LIFT * influence);
        leanTarget.set(clamp(-1, 1, dx / sigma) * LEAN * influence);
      });
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      frame.read(wave);
    };

    const onPointerMove = (event) => {
      if (event.pointerType !== 'mouse') return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.inside = true;
      sunDriftX.set((0.5 - event.clientX / window.innerWidth) * SUN_DRIFT);
      sunDriftY.set((0.5 - event.clientY / window.innerHeight) * SUN_DRIFT);
      schedule();
    };

    const onPointerLeave = () => {
      pointer.inside = false;
      sunDriftX.set(0);
      sunDriftY.set(0);
      schedule();
    };

    scene.addEventListener('pointermove', onPointerMove, { passive: true });
    scene.addEventListener('pointerleave', onPointerLeave);
    const stopFollowingScroll = progress.on('change', () => pointer.inside && schedule());

    return () => {
      scene.removeEventListener('pointermove', onPointerMove);
      scene.removeEventListener('pointerleave', onPointerLeave);
      stopFollowingScroll();
    };
  };

  const playIntro = () => {
    // Spoken order: each letter rises into place a beat after the one before it.
    glyphs.forEach(({ introY, introOpacity }, index) => {
      const delay = 0.15 + index * 0.04;
      animate(introY, 0, { duration: 1.1, ease: EASE_OUT, delay });
      animate(introOpacity, 1, { duration: 0.6, ease: EASE_OUT, delay });
    });
    animate(sunIntroY, 0, { duration: 1.4, ease: EASE_OUT, delay: 0.35 });
    animate(sunIntroScale, 1, { duration: 1.4, ease: EASE_OUT, delay: 0.35 });
    animate(sunOpacity, 1, { duration: 0.8, ease: EASE_OUT, delay: 0.35 });
  };

  document.fonts.ready.then(() => {
    if (!cancelled) setup();
  });

  return () => {
    cancelled = true;
    cleanups.forEach((cleanup) => cleanup());
    values.forEach((value) => value.destroy());
    root.classList.remove('has-motion', 'is-ready', 'is-night');
    themeColor.content = PAPER;
    [sun, ink, phrase].forEach((element) => element.removeAttribute('style'));
    words.forEach((word, index) => {
      word.removeAttribute('aria-hidden');
      word.innerHTML = originalWords[index];
    });
  };
}

let stop = null;
const sync = () => {
  stop?.();
  stop = null;
  if (reduceMotion.matches) {
    root.classList.remove('has-motion');
    return;
  }
  stop = start();
};

reduceMotion.addEventListener('change', sync);
sync();

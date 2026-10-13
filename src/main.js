import {
  animate,
  cancelFrame,
  clamp,
  cubicBezier,
  frame,
  frameData,
  inView,
  mapValue,
  motionValue,
  resize,
  scroll,
  springValue,
  styleEffect,
  transformValue,
} from 'motion';
import voiceUrl from './audio-imchi.mp3';

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

// Hover: each word acts out its meaning. Distances in the letters' own em.
// "Imchii", go: the letters leave along the word, the leading one furthest.
const LEAVE_REACH = 4.5;
const LEAVE_LEAN = 12;
const LEAVE_STAGGER = 0.035;
const LEAVE_SPRING = { type: 'spring', duration: 0.5, bounce: 0.2 };
// "wi3awde", again: outlined echoes keep peeling off the word while it is hovered.
const ECHOES = 3;
const ECHO_CYCLE = 1.2;
const ECHO_DRIFT = 0.9;
// "iji", come back: the letters come to a nearby cursor, single file, and go home after.
const COME_RADIUS = 2.4;
const COME_PULL = 0.5;
const COME_MAX = 0.9;
const SUN_DRIFT = 10;

// springValue takes duration in ms; it skips animate()'s seconds conversion.
const SCROLL_SPRING = { duration: 500, bounce: 0 };
const HOVER_SPRING = { duration: 500, bounce: 0.2 };

// Voice: the recording's speech RMS sits around 0.03–0.1, so ×10 maps it to 0–1.
const VOICE_GAIN = 10;
const VOICE_RELEASE = 150;
const SUN_SWELL = 0.03;

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
const soundButton = document.querySelector('.sound');
const soundLabel = soundButton.querySelector('.sound__label');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const voiceLevel = motionValue(0);

const setNight = (isNight) => {
  root.classList.toggle('is-night', isNight);
  themeColor.content = isNight ? INK : PAPER;
};

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
    splitWord(word).map((el, letterIndex) => ({
      el,
      face: el.firstElementChild,
      wordIndex,
      letterIndex,
      introY: track(motionValue(0.32)),
      introOpacity: track(motionValue(0)),
      leave: {
        x: track(motionValue(0)),
        y: track(motionValue(0)),
        rotate: track(motionValue(0)),
        skew: track(motionValue(0)),
      },
      come: {
        x: track(motionValue(0)),
        y: track(motionValue(0)),
      },
      echoes: [],
    })),
  );

  // Echo layers for "wi3awde": outlines of each letter, tucked behind its face.
  glyphs.filter((glyph) => glyph.wordIndex === 1).forEach((glyph) => {
    glyph.echoes = Array.from({ length: ECHOES }, () => {
      const echo = document.createElement('span');
      echo.className = 'phrase__echo';
      echo.textContent = glyph.face.textContent;
      glyph.el.append(echo);
      return { el: echo, loop: null };
    });
  });

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
        size: parseFloat(from.fontSize),
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

  // Eased progress of one letter's journey from the first composition to the second.
  const journey = (glyph, p, layout) => (
    easeInOut(clamp(0, 1, (p - layout.starts.get(glyph)) / MORPH_DURATION))
  );

  const setup = () => {
    geometry.set(measure());

    glyphs.forEach((glyph) => {
      const { leave } = glyph;
      // Single file: each letter of "iji" answers a beat later than the one before.
      const [comeX, comeY] = [glyph.come.x, glyph.come.y].map((value) => (
        track(springValue(value, { duration: 500 + glyph.letterIndex * 120, bounce: 0.2 }))
      ));

      const travel = track(transformValue(() => {
        const p = progress.get();
        const layout = geometry.get();
        const path = layout.words[glyph.wordIndex];
        const t = journey(glyph, p, layout);
        const bow = Math.sin(Math.PI * t) * ARC;
        const tx = path.dx * t + path.nx * bow;
        const ty = path.dy * t + path.ny * bow;
        return `translate(${tx}px, ${ty}px) translate(${path.ox}px, ${path.oy}px) rotate(${path.angle * t}deg) translate(${-path.ox}px, ${-path.oy}px) scale(${1 + (path.scale - 1) * t})`;
      }));

      const pose = track(transformValue(() => {
        const x = leave.x.get() + comeX.get();
        const y = glyph.introY.get() + leave.y.get() + comeY.get();
        return `translate(${x}em, ${y}em) rotate(${leave.rotate.get()}deg) skewX(${leave.skew.get()}deg)`;
      }));

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
      const swell = 1 + SUN_SWELL * voiceLevel.get();
      const scale = (1 + (path.scale - 1) * t) * sunIntroScale.get() * swell;
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
      setNight(isNight);
    }));

    cleanups.push(
      scroll((p) => rawProgress.set(p), { target: experience }),
      resize(() => geometry.set(measure())),
    );

    cleanups.push(bindPointer());

    // Lift the CSS guard only once Motion has written the hidden intro state.
    frame.postRender(() => {
      if (cancelled) return;
      root.classList.add('is-ready');
      playIntro();
    });
  };

  const bindPointer = () => {
    const [goWord, againWord] = words;
    const lettersOf = (wordIndex) => glyphs.filter((glyph) => glyph.wordIndex === wordIndex);
    const centreOf = (el) => {
      const rect = el.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };

    // Where a letter stands right now: mid-journey it may be turned and rescaled.
    const stance = (glyph) => {
      const layout = geometry.get();
      const path = layout.words[glyph.wordIndex];
      const t = journey(glyph, progress.get(), layout);
      return { angle: (path.angle * t * Math.PI) / 180, em: path.size * (1 + (path.scale - 1) * t) };
    };

    // How far one can travel from a point, along a direction, before leaving the screen.
    const roomFrom = ({ x, y }, ux, uy) => Math.min(
      ux > 0 ? (window.innerWidth - x) / ux : ux < 0 ? -x / ux : Infinity,
      uy > 0 ? (window.innerHeight - y) / uy : uy < 0 ? -y / uy : Infinity,
    );

    // "Imchii", go: the letters set off along the word towards the open side of the
    // screen, the leading one first and furthest, leaning into the motion.
    const depart = () => {
      const letters = lettersOf(0);
      const { angle, em } = stance(letters[0]);
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      const ahead = roomFrom(centreOf(letters.at(-1).el), ux, uy);
      const behind = roomFrom(centreOf(letters[0].el), -ux, -uy);
      const direction = ahead >= behind ? 1 : -1;
      const reach = clamp(0.5, LEAVE_REACH, (Math.max(ahead, behind) - em * 0.4) / em);

      letters.forEach(({ leave, letterIndex }) => {
        const rank = direction > 0 ? letterIndex : letters.length - 1 - letterIndex;
        const share = Math.min(1, ((rank + 1) / letters.length) * (0.85 + Math.random() * 0.3));
        const options = { ...LEAVE_SPRING, delay: (letters.length - 1 - rank) * LEAVE_STAGGER };
        animate(leave.x, direction * reach * share, options);
        animate(leave.y, (Math.random() * 2 - 1) * 0.06, options);
        animate(leave.rotate, (Math.random() * 2 - 1) * 4, options);
        animate(leave.skew, -direction * LEAVE_LEAN, options);
      });
    };

    const comeHome = () => {
      lettersOf(0).forEach(({ leave, letterIndex }) => {
        const options = { ...LEAVE_SPRING, delay: letterIndex * LEAVE_STAGGER * 0.5 };
        animate(leave.x, 0, options);
        animate(leave.y, 0, options);
        animate(leave.rotate, 0, options);
        animate(leave.skew, 0, options);
      });
    };

    // "Wi3awde", again: while hovered, outlines keep peeling off every letter in a
    // ripple across the word, over and over.
    const repeat = () => {
      lettersOf(1).forEach(({ echoes, letterIndex }) => {
        echoes.forEach((echo, k) => {
          echo.loop?.stop();
          echo.loop = animate(
            echo.el,
            { transform: ['translateY(0em)', `translateY(${ECHO_DRIFT}em)`], opacity: [0.9, 0] },
            { duration: ECHO_CYCLE, ease: EASE_OUT, repeat: Infinity, delay: (k * ECHO_CYCLE) / ECHOES + letterIndex * 0.04 },
          );
        });
      });
    };

    const fallSilent = () => {
      lettersOf(1).forEach(({ echoes }) => echoes.forEach((echo) => {
        echo.loop?.stop();
        echo.loop = animate(echo.el, { opacity: 0 }, { duration: 0.2, ease: EASE_OUT });
      }));
    };

    // "Iji", come back: within reach of the cursor the letters come to it; out of
    // reach, or when the cursor leaves, they return to their places.
    let pointer = null;
    let scheduled = false;
    const beckon = () => {
      scheduled = false;
      const letters = lettersOf(2);
      const centres = letters.map(({ el }) => centreOf(el));
      const middle = {
        x: centres.reduce((sum, { x }) => sum + x, 0) / centres.length,
        y: centres.reduce((sum, { y }) => sum + y, 0) / centres.length,
      };

      // The word travels as one; its springs, a beat apart, string it out single file.
      letters.forEach((glyph) => {
        const { come } = glyph;
        if (!pointer) {
          come.x.set(0);
          come.y.set(0);
          return;
        }
        const { angle, em } = stance(glyph);
        const away = Math.hypot(pointer.x - middle.x, pointer.y - middle.y) / em;
        const near = 1 - clamp(0, 1, (away - 0.8) / (COME_RADIUS - 0.8));
        const pull = COME_PULL * near * near * (3 - 2 * near);
        let dx = ((pointer.x - middle.x) * pull) / em;
        let dy = ((pointer.y - middle.y) * pull) / em;
        const length = Math.hypot(dx, dy);
        if (length > COME_MAX) {
          dx *= COME_MAX / length;
          dy *= COME_MAX / length;
        }
        come.x.set(dx * Math.cos(angle) + dy * Math.sin(angle));
        come.y.set(-dx * Math.sin(angle) + dy * Math.cos(angle));
      });
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      frame.read(beckon);
    };

    // Judge each event, not the primary pointer: touch-capable displays often
    // report a coarse primary pointer even while a mouse is in use.
    const onGoEnter = (event) => event.pointerType !== 'touch' && depart();
    const onAgainEnter = (event) => event.pointerType !== 'touch' && repeat();

    const onPointerMove = (event) => {
      if (event.pointerType === 'touch') return;
      pointer = { x: event.clientX, y: event.clientY };
      sunDriftX.set((0.5 - event.clientX / window.innerWidth) * SUN_DRIFT);
      sunDriftY.set((0.5 - event.clientY / window.innerHeight) * SUN_DRIFT);
      schedule();
    };

    const onPointerLeave = () => {
      pointer = null;
      sunDriftX.set(0);
      sunDriftY.set(0);
      schedule();
    };

    goWord.addEventListener('pointerenter', onGoEnter);
    goWord.addEventListener('pointerleave', comeHome);
    againWord.addEventListener('pointerenter', onAgainEnter);
    againWord.addEventListener('pointerleave', fallSilent);
    scene.addEventListener('pointermove', onPointerMove, { passive: true });
    scene.addEventListener('pointerleave', onPointerLeave);
    const stopFollowingScroll = progress.on('change', () => pointer && schedule());

    return () => {
      goWord.removeEventListener('pointerenter', onGoEnter);
      goWord.removeEventListener('pointerleave', comeHome);
      againWord.removeEventListener('pointerenter', onAgainEnter);
      againWord.removeEventListener('pointerleave', fallSilent);
      scene.removeEventListener('pointermove', onPointerMove);
      scene.removeEventListener('pointerleave', onPointerLeave);
      stopFollowingScroll();
      lettersOf(1).forEach(({ echoes }) => echoes.forEach((echo) => echo.loop?.stop()));
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
    root.classList.remove('has-motion', 'is-ready');
    setNight(false);
    [sun, ink, phrase].forEach((element) => element.removeAttribute('style'));
    words.forEach((word, index) => {
      word.removeAttribute('aria-hidden');
      word.innerHTML = originalWords[index];
    });
  };
}

// Static compositions: night falls when the dark one reaches the listen control.
function watchNight() {
  const stopWatching = inView(ghostScene, () => {
    setNight(true);
    return () => setNight(false);
  }, { margin: '-90% 0px 0px 0px' });

  return () => {
    stopWatching();
    setNight(false);
  };
}

// One listen-through of the recording; its loudness swells the sun as it speaks.
function bindVoice() {
  let voice;
  let context;
  let analyser;
  let samples;

  // Fast attack, eased release, so each syllable reads as one breath.
  const listen = () => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    const loudness = Math.min(1, Math.sqrt(sum / samples.length) * VOICE_GAIN);
    const release = voiceLevel.get() * Math.exp(-frameData.delta / VOICE_RELEASE);
    voiceLevel.set(Math.max(loudness, release));
  };

  const setPlaying = (playing) => {
    soundButton.classList.toggle('is-playing', playing);
    soundLabel.textContent = playing ? 'Pause' : 'Écouter';
    cancelFrame(listen);
    if (playing && analyser) frame.read(listen, true);
    else animate(voiceLevel, 0, { duration: 0.2, ease: EASE_OUT });
  };

  const load = () => {
    voice = new Audio(voiceUrl);
    voice.preload = 'auto';
    voice.addEventListener('play', () => setPlaying(true));
    voice.addEventListener('pause', () => setPlaying(false));

    // Without Web Audio the voice still plays, only the swell is lost.
    try {
      context = new AudioContext();
      analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      samples = new Float32Array(analyser.fftSize);
      context.createMediaElementSource(voice).connect(analyser);
      analyser.connect(context.destination);
    } catch {
      analyser = null;
    }
  };

  soundButton.addEventListener('click', () => {
    if (!voice) load();
    if (!voice.paused) {
      voice.pause();
      return;
    }
    context?.resume();
    voice.play().catch(() => setPlaying(false));
  });

  styleEffect(soundButton.querySelector('.sound__dot'), { '--voice': voiceLevel });
  soundButton.hidden = false;
}

let stop = null;
const sync = () => {
  stop?.();
  if (reduceMotion.matches) {
    root.classList.remove('has-motion');
    stop = watchNight();
    return;
  }
  stop = start();
};

bindVoice();
reduceMotion.addEventListener('change', sync);
sync();

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const experience = document.querySelector('.experience');
const words = [...experience.querySelectorAll('.phrase__word')];
const originalWords = words.map((word) => word.textContent);
const media = gsap.matchMedia();
const releaseDirection = Math.random() < 0.5 ? -1 : 1;

media.add(
  {
    reduceMotion: '(prefers-reduced-motion: reduce)',
    desktop: '(min-width: 900px)',
    compact: '(max-width: 899px)',
  },
  (context) => {
    const { reduceMotion, desktop } = context.conditions;

    if (reduceMotion) return;

    document.documentElement.classList.add('has-motion');

    const splitWords = words.map((word) => {
      const glyphs = [...word.textContent].map((character) => {
        const glyph = document.createElement('span');
        glyph.className = 'phrase__glyph';
        glyph.setAttribute('aria-hidden', 'true');
        if (character === '3') glyph.dataset.glyph = '3';

        const face = document.createElement('span');
        face.className = 'phrase__glyph-face';
        face.textContent = character;
        glyph.append(face);
        return glyph;
      });

      word.setAttribute('aria-hidden', 'true');
      word.replaceChildren(...glyphs);
      return glyphs;
    });
    const expressionWords = words.slice(0, 3);
    const recompositionWords = words.slice(3, 6);
    const expressionGlyphs = splitWords.slice(0, 3).flat();
    const recompositionGlyphs = splitWords.slice(3, 6).flat();
    const expressionFaces = expressionGlyphs.map((glyph) => glyph.firstElementChild);
    const recompositionFaces = recompositionGlyphs.map((glyph) => glyph.firstElementChild);
    const travel = desktop ? 92 : 34;
    const pointerPhrases = [];
    let onPointerMove;
    let onPointerLeave;

    const intro = gsap.timeline();
    intro.fromTo(
      expressionFaces,
      { y: (index) => (index % 2 === 0 ? '0.48em' : '-0.34em'), opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 1.25,
        stagger: { each: 0.025, from: 'random' },
        ease: 'power3.out',
        clearProps: 'transform,opacity',
      },
    );

    const journey = gsap.timeline({
      scrollTrigger: {
        trigger: experience,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.6,
        invalidateOnRefresh: true,
      },
    });

    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      const activeWords = new Map();

      const resetWord = (phrase, state) => {
        if (!state) return;
        gsap.killTweensOf(state.glyphs);
        gsap.to(state.glyphs, {
          x: 0,
          y: 0,
          z: 0,
          rotationX: 0,
          rotationY: 0,
          rotationZ: 0,
          scale: 1,
          duration: 0.48,
          stagger: 0.014,
          ease: 'power3.out',
          clearProps: 'willChange',
        });
        activeWords.delete(phrase);
      };

      onPointerMove = (event) => {
        const glyph = event.target.closest('.phrase__glyph');
        const word = glyph?.parentElement;
        const phrase = event.currentTarget;
        if (!glyph || !word?.classList.contains('phrase__word')) return;

        const glyphs = [...word.querySelectorAll('.phrase__glyph')];
        const index = glyphs.indexOf(glyph);
        const active = activeWords.get(phrase);
        if (active?.word === word && active.index === index) return;
        if (active) resetWord(phrase, active);

        const state = { word, glyphs, index };
        activeWords.set(phrase, state);
        gsap.killTweensOf(glyphs);
        gsap.set(glyphs, { willChange: 'transform' });
        gsap.to(glyphs, {
          x: (letterIndex) => {
            const offset = letterIndex - index;
            return offset * 25 + (offset === 0 ? 0 : releaseDirection * 5);
          },
          y: (letterIndex) => {
            const offset = letterIndex - index;
            return Math.abs(offset) * 9 + (offset === 0 ? -20 : Math.sign(offset) * 8);
          },
          z: (letterIndex) => letterIndex === index ? 112 : 70 - Math.abs(letterIndex - index) * 9,
          rotationX: (letterIndex) => (letterIndex - index) * 11,
          rotationY: (letterIndex) => (index - letterIndex) * 17,
          rotationZ: (letterIndex) => (letterIndex - index) * 4,
          scale: (letterIndex) => letterIndex === index ? 1.16 : 0.97,
          duration: 0.62,
          stagger: { each: 0.018, from: index },
          ease: 'power3.out',
        });
      };

      onPointerLeave = (event) => resetWord(event.currentTarget, activeWords.get(event.currentTarget));

      experience.querySelectorAll('.phrase').forEach((phrase) => {
        phrase.addEventListener('pointermove', onPointerMove, { passive: true });
        phrase.addEventListener('pointerleave', onPointerLeave);
        pointerPhrases.push(phrase);
      });
    }

    journey.to('.phrase--expression', {
      scale: desktop ? 1.08 : 1.025,
      rotation: desktop ? -2 : -0.5,
      x: desktop ? -24 : -8,
      ease: 'none',
      duration: 0.16,
    }, 0.05);
    journey.to(expressionWords[0], {
      x: -travel * releaseDirection,
      y: desktop ? -28 : -14,
      rotation: desktop ? -5 : -2,
      ease: 'none',
      duration: 0.2,
    }, 0.22);
    journey.to(expressionWords[1], {
      x: travel * 0.5 * releaseDirection,
      y: desktop ? 18 : 9,
      rotation: desktop ? 2.5 : 1,
      ease: 'none',
      duration: 0.2,
    }, 0.22);
    journey.to(expressionWords[2], {
      x: (desktop ? -travel * 0.9 : -travel * 0.5) * releaseDirection,
      y: desktop ? 30 : 14,
      rotation: desktop ? 6 : 3,
      ease: 'none',
      duration: 0.2,
    }, 0.22);
    journey.to(document.body, {
      backgroundColor: '#171717',
      ease: 'none',
      duration: 0.12,
    }, 0.43);
    journey.fromTo(
      recompositionWords,
      {
        x: (index) => (index === 1 ? travel : -travel) * releaseDirection,
        y: (index) => (index % 2 === 0 ? 36 : -30),
        rotation: (index) => (index === 0 ? -102 : (index - 1) * 6),
      },
      {
        x: 0,
        y: 0,
        rotation: (index) => (index === 0 ? -90 : 0),
        ease: 'none',
        duration: 0.24,
        stagger: 0.025,
      },
      0.55,
    );
    journey.fromTo(
      '.phrase--recomposition',
      { color: '#171717' },
      { color: '#F2EFE7', ease: 'none', duration: 0.18 },
      0.48,
    );
    journey.to(recompositionFaces, {
      y: (index) => (index % 2 === 0 ? -4 : 4),
      ease: 'none',
      duration: 0.1,
      stagger: { each: 0.006, from: 'start' },
    }, 0.78);
    journey.to(recompositionFaces, {
      y: 0,
      ease: 'power2.out',
      duration: 0.12,
      stagger: { each: 0.006, from: 'end' },
    }, 0.88);

    return () => {
      if (onPointerMove && onPointerLeave) {
        pointerPhrases.forEach((phrase) => {
          phrase.removeEventListener('pointermove', onPointerMove);
          phrase.removeEventListener('pointerleave', onPointerLeave);
        });
      }
      document.documentElement.classList.remove('has-motion');
      words.forEach((word, index) => {
        word.removeAttribute('aria-hidden');
        word.textContent = originalWords[index];
      });
    };
  },
);
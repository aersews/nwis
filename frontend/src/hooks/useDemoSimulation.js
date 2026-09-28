import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../lib/api.js";

/* =========================================================
   DEMO SCENARIO DRIVER
   GET /api/simulation/{well_id}?step={step}

   The backend already models a worsening drilling sequence.
   This hook only decides *when* to ask for the next step and
   gives the operator start / pause / restart / step / speed.
   Every displayed number still comes from the endpoint.
   ========================================================= */

export const MAX_STEP = 6;
const HOLD_TICKS = 6;
const TICK_MS = 2000;
export const SPEEDS = [0.5, 1, 2, 4];
const MAX_HISTORY = 90;

export const PHASES = {
  idle: {
    id: "idle",
    name: "Standby",
    description: "Scenario paused before the first sample"
  },
  advancing: {
    id: "advancing",
    name: "Drilling",
    description: "Depth advancing through the target interval"
  },
  hold: {
    id: "hold",
    name: "Critical hold",
    description:
      "Held at the degraded end of the sequence so the evidence chain stays inspectable"
  },
  complete: {
    id: "complete",
    name: "Sequence complete",
    description:
      "End of the scripted window — the critical state is held for review, press restart to replay"
  },
  error: {
    id: "error",
    name: "Stream unavailable",
    description: "The simulation endpoint did not respond"
  }
};

export function useDemoSimulation(wellId, { onFrame, onRestart } = {}) {
  const [running, setRunning] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [step, setStep] = useState(0);
  const [frame, setFrame] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [holdRemaining, setHoldRemaining] = useState(0);

  const stepRef = useRef(0);
  const holdRef = useRef(0);
  const speedRef = useRef(1);
  const frameCb = useRef(onFrame);
  const restartCb = useRef(onRestart);
  const generationRef = useRef(0);

  useEffect(() => {
    frameCb.current = onFrame;
    restartCb.current = onRestart;
  }, [onFrame, onRestart]);
  const commit = useCallback((data, next) => {
    setFrame(data);
    setStep(next.step);
    setHoldRemaining(next.hold);
    setHistory((prev) =>
      prev.length >= MAX_HISTORY ? [...prev.slice(1), data] : [...prev, data]
    );
    frameCb.current?.(data);
  }, []);

  /* Pure transition: returns the next (step, hold, done) triple
     without touching refs, so React state and refs can never
     disagree. `done` is set on the final tick of the critical
     hold — not on the tick that enters it. */
  const advance = useCallback((currentStep, currentHold) => {
    if (currentHold > 0) {
      const hold = currentHold - 1;
      return { step: currentStep, hold, done: hold === 0 };
    }
    if (currentStep >= MAX_STEP) {
      return { step: currentStep, hold: HOLD_TICKS, done: false };
    }
    return { step: currentStep + 1, hold: 0, done: false };
  }, []);

  useEffect(() => {
    if (!running) return undefined;

    let cancelled = false;
    let timer = null;
    let controller = null;
    const generation = generationRef.current;

    const run = async () => {
      if (cancelled) return;

      controller = new AbortController();

      try {
        const data = await api.simulation(wellId, stepRef.current, {
          signal: controller.signal
        });

        if (cancelled || generation !== generationRef.current) return;

        const next = advance(stepRef.current, holdRef.current);
        stepRef.current = next.step;
        holdRef.current = next.hold;

        setError(null);
        commit(data, next);

        /* The sequence ends after the critical hold. Restarting
           from step 0 unannounced would yank the operator out of
           the critical state they are reading. */
        if (next.done) {
          setRunning(false);
          return;
        }
      } catch (err) {
        if (cancelled) return;
        if (err?.name === "AbortError") return;
        setError(err?.message ?? "Simulation request failed");
        setRunning(false);
        return;
      }

      if (cancelled) return;
      timer = setTimeout(run, TICK_MS / speedRef.current);
    };

    timer = setTimeout(run, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller?.abort();
    };
  }, [running, wellId, commit, advance]);

  const pause = useCallback(() => setRunning(false), []);

  const restart = useCallback(() => {
    generationRef.current += 1;
    stepRef.current = 0;
    holdRef.current = 0;
    setStep(0);
    setFrame(null);
    setHistory([]);
    setHoldRemaining(0);
    setError(null);
    setRunning(false);
    restartCb.current?.();
  }, []);

  const stepForward = useCallback(() => {
    if (stepRef.current >= MAX_STEP) return;
    setRunning(false);

    const next = advance(stepRef.current, 0);
    stepRef.current = next.step;
    holdRef.current = next.hold;

    const controller = new AbortController();
    api
      .simulation(wellId, next.step, { signal: controller.signal })
      .then((data) => commit(data, next))
      .catch((err) => {
        if (err?.name !== "AbortError") {
          setError(err?.message ?? "Simulation request failed");
        }
      });

    return () => controller.abort();
  }, [wellId, commit, advance]);

  const setSpeed = useCallback((value) => {
    const next = SPEEDS.includes(Number(value)) ? Number(value) : 1;
    speedRef.current = next;
    setSpeedState(next);
  }, []);

  const start = useCallback(() => {
    if (step >= MAX_STEP) return;
    setError(null);
    setRunning(true);
  }, [step]);

  /** Clears a stream failure without rewinding the sequence. */
  const retry = useCallback(() => {
    setError(null);
  }, []);

  /* Derived purely from state so a render never depends on a
     mutable ref that a background tick may have changed. */
  const phase = (() => {
    if (error) return PHASES.error;
    if (holdRemaining > 0) return PHASES.hold;
    if (!running && step >= MAX_STEP) return PHASES.complete;
    if (running) return PHASES.advancing;
    return PHASES.idle;
  })();

  return {
    running,
    paused: !running,
    speed,
    step,
    frame,
    history,
    error,
    phase,
    holdRemaining,
    maxStep: MAX_STEP,
    atEnd: step >= MAX_STEP,
    start,
    pause,
    restart,
    stepForward,
    retry,
    setSpeed
  };
}

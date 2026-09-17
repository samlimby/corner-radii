"use client";;
// beui.dev/components/motion/range-slider

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { SPRING_GLIDE } from "@/lib/ease";
import { snapSliderValue, useSlider } from "@/lib/hooks/use-slider";
import { capturePointer, releasePointer, TOUCH_GESTURE_CLASS } from "@/lib/touch";
import { cn } from "@/lib/utils";

const STOP_COUNT = 10;
const HANDLE_START = 8;
const HANDLE_END_INSET = 12;
const TEXT_INSET = 20;
// Matches RangeSlider's bouncy grab and release feedback.
const SPRING_BOUNCY = {
  type: "spring",
  stiffness: 500,
  damping: 14,
  mass: 0.7
};

function mapBetweenStops(
  stops,
  point,
  from,
  to,
) {
  const upperIndex = stops.findIndex((stop) => stop[from] >= point);
  const upper = stops[upperIndex < 0 ? stops.length - 1 : upperIndex];
  const lower = stops[Math.max(0, upperIndex - 1)];
  if (lower[from] === upper[from]) return upper[to];
  return lower[to] +
    ((point - lower[from]) / (upper[from] - lower[from])) * (upper[to] - lower[to]);
}

function nearestStop(stops, x) {
  return stops.reduce((nearest, stop) =>
    Math.abs(stop.x - x) < Math.abs(nearest.x - x) ? stop : nearest,
  );
}

/** An always-visible inline slider with an inset fill and a thumb that parts
 * around its labels, keeping their text readable as the handle passes them. */
export function InlineSlider({
  label,
  format = String,
  showTicks = true,
  stops: stopValues,
  className,
  ...options
}) {
  const reduce = useReducedMotion();
  const step = options.step && options.step > 0 ? options.step : 1;
  const { current, min, max, commit, trackProps, sliderProps } = useSlider({
    ...options,
    step,
    "aria-label": options["aria-label"] ?? label,
    formatValueText: options.formatValueText ?? format,
  });
  const labelRef = useRef(null);
  const readoutRef = useRef(null);
  const readoutTextRef = useRef(null);
  const [geometry, setGeometry] = useState({
    width: 292,
    labelWidth: 22,
    readoutWidth: 24,
    readoutTextWidth: 24,
  });
  const [dragging, setDragging] = useState(false);
  const dragFrame = useRef(null);
  const pendingDragValue = useRef(null);
  const gesture = useRef(null);

  useLayoutEffect(() => {
    const track = trackProps.ref.current;
    const labelElement = labelRef.current;
    const readout = readoutRef.current;
    const readoutText = readoutTextRef.current;
    if (!track || !labelElement || !readout || !readoutText) return;
    const measure = () => {
      // Layout dimensions stay stable while an ancestor is animating a transform.
      const width = track.clientWidth;
      if (!width) return;
      const next = {
        width,
        labelWidth: labelElement.offsetWidth,
        readoutWidth: readout.offsetWidth,
        readoutTextWidth: readoutText.offsetWidth,
      };
      setGeometry((previous) =>
        previous.width === next.width && previous.labelWidth === next.labelWidth &&
        previous.readoutWidth === next.readoutWidth &&
        previous.readoutTextWidth === next.readoutTextWidth ? previous : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    observer.observe(labelElement);
    observer.observe(readout);
    observer.observe(readoutText);
    return () => observer.disconnect();
  }, [trackProps.ref]);

  const labelBounds = { start: TEXT_INSET, end: TEXT_INSET + geometry.labelWidth };
  const readoutBounds = {
    start: geometry.width - TEXT_INSET - geometry.readoutWidth,
    end: geometry.width - TEXT_INSET,
  };
  const endX = Math.max(HANDLE_START, geometry.width - HANDLE_END_INSET);
  const stops = useMemo(() => {
    const explicitValues = Array.isArray(stopValues)
      ? [...new Set(stopValues
        .map((value) => snapSliderValue(value, min, max, step))
        .filter((value) => value > min && value < max))]
        .sort((a, b) => a - b)
      : null;
    const values = explicitValues
      ? [min, ...explicitValues, max]
      : [...new Set(Array.from({ length: STOP_COUNT }, (_, index) =>
        snapSliderValue(min + (index / (STOP_COUNT - 1)) * (max - min), min, max, step),
      ))];

    if (explicitValues) {
      const tickStart = Math.min(endX, labelBounds.end + 12);
      const tickEnd = Math.max(tickStart, Math.min(endX, readoutBounds.start - 12));
      return values.map((value, index) => {
        if (index === 0) return { value, x: HANDLE_START };
        if (index === values.length - 1) return { value, x: endX };
        const tickIndex = index - 1;
        return {
          value,
          x: explicitValues.length === 1
            ? (tickStart + tickEnd) / 2
            : tickStart + (tickIndex / (explicitValues.length - 1)) * (tickEnd - tickStart),
        };
      });
    }

    return values.map((value, index) => ({
      value,
      x: values.length === 1
        ? HANDLE_START
        : HANDLE_START + (index / (values.length - 1)) * (endX - HANDLE_START),
    }));
  }, [endX, labelBounds.end, max, min, readoutBounds.start, step, stopValues]);
  const restingX = mapBetweenStops(stops, current, "value", "x");
  // One motion value owns the thumb for the entire gesture. Pointer movement
  // writes pixels directly; only release/click/keyboard changes use a spring.
  // Never derive dragging pixels from a rounded value or swap to a lagging spring.
  const handleX = useMotionValue(restingX);
  const restingTarget = useRef(restingX);
  const settleTo = useCallback((x) => {
    restingTarget.current = x;
    handleX.jump(handleX.get());
    if (reduce) handleX.jump(x);
    else animate(handleX, x, { type: "spring", ...SPRING_GLIDE });
  }, [handleX, reduce]);
  useLayoutEffect(() => {
    if (gesture.current || restingTarget.current === restingX) return;
    settleTo(restingX);
  }, [dragging, restingX, settleTo]);
  useEffect(() => () => {
    handleX.stop();
    if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
  }, [handleX]);
  const fillRight = useTransform(handleX, (x) =>
    x >= endX ? geometry.width : x + 8,
  );
  // Slide a fixed-size fill inside the clipping window. The labels and
  // dots stay above it, and only transforms animate.
  const fillX = useTransform(fillRight, (right) => right - geometry.width);
  // Part progressively over six pixels at each text edge instead of
  // toggling the stem on/off in a single pointer frame. The thumb uses the
  // same two-dot treatment across both the label and numeric readout.
  const split = useTransform(handleX, (x) => {
    const overlap = (start, end) => Math.max(0, Math.min(
      1,
      (x + 4 - start) / 6,
      (end - x) / 6,
    ));
    return Math.max(
      overlap(TEXT_INSET, TEXT_INSET + geometry.labelWidth),
      overlap(
        geometry.width - TEXT_INSET - geometry.readoutTextWidth,
        geometry.width - TEXT_INSET,
      ),
    );
  });
  const stemOpacity = useTransform(split, (amount) => 1 - amount);
  const capTop = useTransform(split, (amount) => -amount);
  const capBottom = useTransform(split, (amount) => amount);
  const overlapsText = (x, bounds) =>
    x + 2 >= bounds.start && x - 2 <= bounds.end;
  const ticks = showTicks
    ? stops
      .map((stop) => stop.x)
      .filter((x) => !overlapsText(x, labelBounds) && !overlapsText(x, readoutBounds))
    : [];

  const queueDragCommit = (value) => {
    pendingDragValue.current = value;
    if (dragFrame.current !== null) return;
    dragFrame.current = requestAnimationFrame(() => {
      dragFrame.current = null;
      if (pendingDragValue.current !== null) commit(pendingDragValue.current);
      pendingDragValue.current = null;
    });
  };

  const cancelDragCommit = () => {
    if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
    dragFrame.current = null;
    pendingDragValue.current = null;
  };

  const endGesture = (event) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    // Clear before releasing capture: its lost-capture event must not commit twice.
    gesture.current = null;
    cancelDragCommit();
    setDragging(false);
    if (!options.disabled && geometry.width > 0) {
      const x = event.type === "pointerup"
        ? (event.clientX - active.left) * active.scale - active.offset
        : active.x;
      const stop = nearestStop(stops, x);
      // Release capture before a committed value can relocate the whole panel.
      releasePointer(event.currentTarget, event.pointerId);
      settleTo(options.value === undefined ? stop.x : restingX);
      commit(stop.value);
      options.onValueCommit?.(stop.value);
    } else {
      settleTo(restingX);
    }
    releasePointer(event.currentTarget, event.pointerId);
  };

  return (
    <div
      {...trackProps}
      onPointerDown={(event) => {
        if (options.disabled || event.button !== 0 || gesture.current) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (!rect.width) return;
        event.preventDefault();
        const pointerScale = geometry.width / rect.width;
        const pointerX = (event.clientX - rect.left) * pointerScale;
        const thumbX = handleX.get();
        // Grabbing the thumb preserves the exact grab point. A track click
        // waits for release, so it glides to a dot without an intermediate jump.
        const offset = Math.abs(pointerX - thumbX - 2) <= 12 ? pointerX - thumbX : 2;
        gesture.current = { id: event.pointerId, left: rect.left, offset, scale: pointerScale, x: thumbX };
        setDragging(true);
        handleX.stop();
        cancelDragCommit();
        capturePointer(event.currentTarget, event.pointerId);
        event.currentTarget.querySelector("[role=slider]")?.focus({ preventScroll: true });
      }}
      onPointerMove={(event) => {
        const active = gesture.current;
        if (!active || active.id !== event.pointerId || options.disabled) return;
        const x = Math.min(
          endX,
          Math.max(HANDLE_START, (event.clientX - active.left) * active.scale - active.offset),
        );
        active.x = x;
        handleX.set(x);
        // Use the same piecewise map as the resting stops, so value and
        // position agree throughout the drag.
        queueDragCommit(
          Array.isArray(stopValues)
            ? nearestStop(stops, x).value
            : mapBetweenStops(stops, x, "x", "value"),
        );
      }}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onLostPointerCapture={endGesture}
      className={cn(
        "relative h-10 w-full touch-none select-none overflow-hidden rounded-lg bg-muted",
        TOUCH_GESTURE_CLASS,
        options.disabled
          ? "pointer-events-none opacity-50"
          : "cursor-grab active:cursor-grabbing",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg"
      >
        <motion.div
          className="absolute inset-0 rounded-lg bg-foreground/15"
          style={{ x: fillX }}
        />
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 text-foreground">
        <span
          ref={labelRef}
          className="absolute left-5 top-1/2 max-w-[40%] -translate-y-1/2 truncate text-sm font-medium leading-5"
        >
          {label}
        </span>
        <span
          ref={readoutRef}
          className="absolute right-5 top-1/2 grid max-w-[40%] -translate-y-1/2 text-[13px] font-semibold leading-[18px] tracking-tight tabular-nums"
        >
          {/* Reserve the range's full readout width so changing digit counts
              cannot move the dots. Measure the visible text separately for
              the thumb's split animation. */}
          <span className="invisible col-start-1 row-start-1">{format(min)}</span>
          <span className="invisible col-start-1 row-start-1">{format(max)}</span>
          <span ref={readoutTextRef} className="col-start-1 row-start-1 justify-self-end truncate">
            {format(current)}
          </span>
        </span>
        {ticks.map((left) => (
          <span
            key={left}
            className="absolute top-1/2 size-1 -translate-y-1/2 rounded-full bg-foreground/25"
            style={{ left }}
          />
        ))}
      </div>
      <motion.div
        aria-hidden="true"
        animate={reduce ? undefined : { scaleY: dragging ? 1.35 : 1 }}
        transition={SPRING_BOUNCY}
        className="pointer-events-none absolute left-0 top-2 h-6 w-1 text-foreground"
        style={{ x: handleX }}
      >
        <motion.span className="absolute top-0 size-1 rounded-[4px] bg-current" style={{ y: reduce ? 0 : capTop }} />
        <motion.span className="absolute inset-y-0 w-1 rounded-[4px] bg-current" style={{ opacity: stemOpacity }} />
        <motion.span className="absolute bottom-0 size-1 rounded-[4px] bg-current" style={{ y: reduce ? 0 : capBottom }} />
      </motion.div>
      <button
        type="button"
        {...sliderProps}
        onKeyDown={(event) => {
          if (options.disabled) return;
          const next = {
            ArrowRight: stops.find((stop) => stop.value > current)?.value ?? max,
            ArrowUp: stops.find((stop) => stop.value > current)?.value ?? max,
            ArrowLeft: stops.findLast((stop) => stop.value < current)?.value ?? min,
            ArrowDown: stops.findLast((stop) => stop.value < current)?.value ?? min,
            Home: min,
            End: max,
            PageUp: max,
            PageDown: min,
          }[event.key];
          if (next !== undefined) {
            event.preventDefault();
            commit(next);
            options.onValueCommit?.(next);
          }
        }}
        className="absolute inset-0 cursor-inherit touch-none rounded-lg border-0 outline-none"
      />
    </div>
  );
}

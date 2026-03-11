"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { snapMinutes, clampMinutes, minutesToTime } from "@/lib/timeline-utils";

export type DragMode = "move" | "resize-top" | "resize-bottom";

export interface DragState {
  shiftId: string;
  originalShift: { date: string; startMinutes: number; endMinutes: number };
  previewStartMinutes: number;
  previewEndMinutes: number;
  previewDate: string;
  mode: DragMode;
  isDragging: boolean;
  /** Lane info for ghost positioning */
  lane: number;
  totalLanes: number;
  employeeId: string | null;
}

interface UseShiftDragOptions {
  hourHeight: number;
  gridStartHour: number;
  gridEndHour: number;
  minDuration?: number; // default 15
  snapInterval?: number; // default 15
  onDragEnd: (
    shiftId: string,
    newDate: string,
    newStartTime: string,
    newEndTime: string
  ) => void;
  viewMode: "week" | "day";
  dayDates?: string[];
  gridRef: React.RefObject<HTMLDivElement | null>;
  enabled?: boolean;
}

interface InternalDragRef {
  shiftId: string;
  mode: DragMode;
  originalShift: { date: string; startMinutes: number; endMinutes: number };
  pointerStartY: number;
  pointerStartX: number;
  isDragging: boolean;
  lane: number;
  totalLanes: number;
  employeeId: string | null;
  // RAF state
  rafId: number | null;
  lastClientX: number;
  lastClientY: number;
  pendingUpdate: boolean;
}

const DRAG_THRESHOLD = 5; // px before we consider it a drag
const MIN_DURATION_DEFAULT = 15; // minutes

export function useShiftDrag({
  hourHeight,
  gridStartHour,
  gridEndHour,
  minDuration = MIN_DURATION_DEFAULT,
  snapInterval = 15,
  onDragEnd,
  viewMode,
  dayDates,
  gridRef,
  enabled = true,
}: UseShiftDragOptions) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [didDrag, setDidDrag] = useState(false);

  const dragRef = useRef<InternalDragRef | null>(null);
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;

  // Store options in refs for stable event handler access
  const optionsRef = useRef({
    pixelsPerMinute: hourHeight / 60,
    snapInterval,
    gridStartHour,
    gridEndHour,
    minDuration,
    viewMode,
    dayDates,
  });
  optionsRef.current = {
    pixelsPerMinute: hourHeight / 60,
    snapInterval,
    gridStartHour,
    gridEndHour,
    minDuration,
    viewMode,
    dayDates,
  };

  // Compute new preview state from current pointer position
  const computePreview = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragRef.current;
      if (!drag) return null;

      const opts = optionsRef.current;
      const deltaY = clientY - drag.pointerStartY;
      const deltaMinutes = deltaY / opts.pixelsPerMinute;
      const original = drag.originalShift;
      const duration = original.endMinutes - original.startMinutes;

      let newStart = original.startMinutes;
      let newEnd = original.endMinutes;
      let newDate = original.date;

      switch (drag.mode) {
        case "move": {
          const rawNewStart =
            original.startMinutes +
            snapMinutes(deltaMinutes, opts.snapInterval);
          newStart = clampMinutes(rawNewStart, opts.gridStartHour, opts.gridEndHour);
          if (newStart + duration > opts.gridEndHour * 60) {
            newStart = opts.gridEndHour * 60 - duration;
          }
          if (newStart < opts.gridStartHour * 60) {
            newStart = opts.gridStartHour * 60;
          }
          newStart = snapMinutes(newStart, opts.snapInterval);
          newEnd = newStart + duration;
          break;
        }
        case "resize-top": {
          const rawNewStart =
            original.startMinutes +
            snapMinutes(deltaMinutes, opts.snapInterval);
          newStart = clampMinutes(rawNewStart, opts.gridStartHour, opts.gridEndHour);
          newStart = snapMinutes(newStart, opts.snapInterval);
          if (newEnd - newStart < opts.minDuration) {
            newStart = newEnd - opts.minDuration;
          }
          break;
        }
        case "resize-bottom": {
          const rawNewEnd =
            original.endMinutes +
            snapMinutes(deltaMinutes, opts.snapInterval);
          newEnd = clampMinutes(rawNewEnd, opts.gridStartHour, opts.gridEndHour);
          newEnd = snapMinutes(newEnd, opts.snapInterval);
          if (newEnd - newStart < opts.minDuration) {
            newEnd = newStart + opts.minDuration;
          }
          break;
        }
      }

      // Horizontal day detection (week view, move only)
      if (
        opts.viewMode === "week" &&
        drag.mode === "move" &&
        opts.dayDates &&
        gridRef.current
      ) {
        const gridRect = gridRef.current.getBoundingClientRect();
        const timeLabelWidth = 56; // w-14
        const columnsWidth = gridRect.width - timeLabelWidth;
        const columnWidth = columnsWidth / 7;
        const relativeX = clientX - gridRect.left - timeLabelWidth;
        const columnIndex = Math.max(
          0,
          Math.min(6, Math.floor(relativeX / columnWidth))
        );
        if (opts.dayDates[columnIndex]) {
          newDate = opts.dayDates[columnIndex];
        }
      }

      return { newStart, newEnd, newDate };
    },
    [gridRef]
  );

  // RAF-based state update
  const flushUpdate = useCallback(() => {
    const drag = dragRef.current;
    if (!drag || !drag.pendingUpdate) return;
    drag.pendingUpdate = false;
    drag.rafId = null;

    const result = computePreview(drag.lastClientX, drag.lastClientY);
    if (!result) return;

    setDragState({
      shiftId: drag.shiftId,
      originalShift: drag.originalShift,
      previewStartMinutes: result.newStart,
      previewEndMinutes: result.newEnd,
      previewDate: result.newDate,
      mode: drag.mode,
      isDragging: true,
      lane: drag.lane,
      totalLanes: drag.totalLanes,
      employeeId: drag.employeeId,
    });
  }, [computePreview]);

  const handleShiftPointerDown = useCallback(
    (
      e: React.PointerEvent,
      shiftId: string,
      startMin: number,
      endMin: number,
      date: string,
      lane: number,
      totalLanes: number,
      employeeId: string | null
    ) => {
      if (!enabled) return;
      if (e.button !== 0) return;

      // Determine mode from click position on the element
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      // Larger touch handle zones for mobile (16px on touch, 8px on mouse)
      const isTouch = e.pointerType === "touch";
      const HANDLE_SIZE = isTouch ? 20 : 8;

      let mode: DragMode = "move";
      if (relativeY <= HANDLE_SIZE) {
        mode = "resize-top";
      } else if (relativeY >= rect.height - HANDLE_SIZE) {
        mode = "resize-bottom";
      }

      dragRef.current = {
        shiftId,
        mode,
        originalShift: { date, startMinutes: startMin, endMinutes: endMin },
        pointerStartY: e.clientY,
        pointerStartX: e.clientX,
        isDragging: false,
        lane,
        totalLanes,
        employeeId,
        rafId: null,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        pendingUpdate: false,
      };

      setDragState({
        shiftId,
        originalShift: { date, startMinutes: startMin, endMinutes: endMin },
        previewStartMinutes: startMin,
        previewEndMinutes: endMin,
        previewDate: date,
        mode,
        isDragging: false,
        lane,
        totalLanes,
        employeeId,
      });

      e.preventDefault();
      e.stopPropagation();
    },
    [enabled]
  );

  // Global pointer + touch event handlers
  useEffect(() => {
    // Prevent browser scroll/pull-to-refresh during drag
    function onTouchMove(e: TouchEvent) {
      if (dragRef.current?.isDragging) {
        e.preventDefault();
      }
    }

    function onPointerMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;

      const deltaY = e.clientY - drag.pointerStartY;
      const deltaX = e.clientX - drag.pointerStartX;

      // Check threshold
      if (!drag.isDragging) {
        if (
          Math.abs(deltaY) < DRAG_THRESHOLD &&
          Math.abs(deltaX) < DRAG_THRESHOLD
        ) {
          return;
        }
        drag.isDragging = true;

        // Set cursor on body (only for non-touch)
        if (e.pointerType !== "touch") {
          document.body.style.cursor =
            drag.mode === "move" ? "grabbing" : "ns-resize";
        }
        document.body.style.userSelect = "none";
        // Disable overscroll behavior during drag
        document.body.style.overscrollBehavior = "none";
        document.documentElement.style.overflow = "hidden";
      }

      // Store latest position and schedule RAF update
      drag.lastClientX = e.clientX;
      drag.lastClientY = e.clientY;

      if (!drag.pendingUpdate) {
        drag.pendingUpdate = true;
        drag.rafId = requestAnimationFrame(flushUpdate);
      }

      e.preventDefault();
    }

    function onPointerUp() {
      const drag = dragRef.current;
      if (!drag) return;

      // Cancel pending RAF
      if (drag.rafId !== null) {
        cancelAnimationFrame(drag.rafId);
      }

      // Reset styles
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.body.style.overscrollBehavior = "";
      document.documentElement.style.overflow = "";

      if (drag.isDragging) {
        // Compute final position from last known coords
        const result = computePreview(drag.lastClientX, drag.lastClientY);
        if (result) {
          const original = drag.originalShift;
          if (
            result.newStart !== original.startMinutes ||
            result.newEnd !== original.endMinutes ||
            result.newDate !== original.date
          ) {
            onDragEndRef.current(
              drag.shiftId,
              result.newDate,
              minutesToTime(result.newStart),
              minutesToTime(result.newEnd)
            );
          }
        }
        setDragState(null);
        setDidDrag(true);
      } else {
        setDragState(null);
      }

      dragRef.current = null;
    }

    // Use passive: false for touchmove to allow preventDefault
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("pointermove", onPointerMove, {
      passive: false,
    });
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);

    return () => {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
    };
  }, [flushUpdate, computePreview]);

  const clearDidDrag = useCallback(() => {
    setDidDrag(false);
  }, []);

  return {
    dragState,
    handleShiftPointerDown,
    didDrag,
    clearDidDrag,
  };
}

import { doTimesOverlap, ShiftTime } from "@/lib/shift-utils";

describe("doTimesOverlap", () => {
  it("should detect overlap when shifts partially overlap", () => {
    const a: ShiftTime = { date: "2025-01-06", startTime: "09:00", endTime: "17:00" };
    const b: ShiftTime = { date: "2025-01-06", startTime: "15:00", endTime: "21:00" };
    expect(doTimesOverlap(a, b)).toBe(true);
  });

  it("should detect overlap when one shift is inside another", () => {
    const a: ShiftTime = { date: "2025-01-06", startTime: "08:00", endTime: "20:00" };
    const b: ShiftTime = { date: "2025-01-06", startTime: "10:00", endTime: "14:00" };
    expect(doTimesOverlap(a, b)).toBe(true);
  });

  it("should detect overlap for identical shifts", () => {
    const a: ShiftTime = { date: "2025-01-06", startTime: "09:00", endTime: "17:00" };
    const b: ShiftTime = { date: "2025-01-06", startTime: "09:00", endTime: "17:00" };
    expect(doTimesOverlap(a, b)).toBe(true);
  });

  it("should NOT detect overlap when shifts are back to back", () => {
    const a: ShiftTime = { date: "2025-01-06", startTime: "09:00", endTime: "13:00" };
    const b: ShiftTime = { date: "2025-01-06", startTime: "13:00", endTime: "17:00" };
    expect(doTimesOverlap(a, b)).toBe(false);
  });

  it("should NOT detect overlap when shifts are on different dates", () => {
    const a: ShiftTime = { date: "2025-01-06", startTime: "09:00", endTime: "17:00" };
    const b: ShiftTime = { date: "2025-01-07", startTime: "09:00", endTime: "17:00" };
    expect(doTimesOverlap(a, b)).toBe(false);
  });

  it("should NOT detect overlap when shifts don't touch", () => {
    const a: ShiftTime = { date: "2025-01-06", startTime: "06:00", endTime: "10:00" };
    const b: ShiftTime = { date: "2025-01-06", startTime: "14:00", endTime: "18:00" };
    expect(doTimesOverlap(a, b)).toBe(false);
  });

  it("should skip overlap check when comparing same shift id", () => {
    const a: ShiftTime = { date: "2025-01-06", startTime: "09:00", endTime: "17:00", id: "shift-1" };
    const b: ShiftTime = { date: "2025-01-06", startTime: "09:00", endTime: "17:00", id: "shift-1" };
    expect(doTimesOverlap(a, b)).toBe(false);
  });

  it("should detect overlap between different shift ids", () => {
    const a: ShiftTime = { date: "2025-01-06", startTime: "09:00", endTime: "17:00", id: "shift-1" };
    const b: ShiftTime = { date: "2025-01-06", startTime: "10:00", endTime: "15:00", id: "shift-2" };
    expect(doTimesOverlap(a, b)).toBe(true);
  });

  it("should detect overlap at the start boundary", () => {
    const a: ShiftTime = { date: "2025-01-06", startTime: "09:00", endTime: "12:00" };
    const b: ShiftTime = { date: "2025-01-06", startTime: "11:59", endTime: "17:00" };
    expect(doTimesOverlap(a, b)).toBe(true);
  });

  it("should handle early morning and late night shifts", () => {
    const a: ShiftTime = { date: "2025-01-06", startTime: "05:00", endTime: "08:00" };
    const b: ShiftTime = { date: "2025-01-06", startTime: "20:00", endTime: "23:00" };
    expect(doTimesOverlap(a, b)).toBe(false);
  });

  it("should detect overlap with 1-minute overlap", () => {
    const a: ShiftTime = { date: "2025-01-06", startTime: "09:00", endTime: "13:01" };
    const b: ShiftTime = { date: "2025-01-06", startTime: "13:00", endTime: "17:00" };
    expect(doTimesOverlap(a, b)).toBe(true);
  });
});

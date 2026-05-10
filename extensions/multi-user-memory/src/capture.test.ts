import { describe, expect, it } from "vitest";
import { normalizeCaptureCandidate } from "../index.js";

describe("normalizeCaptureCandidate", () => {
  it("captures clear preference statements", () => {
    expect(
      normalizeCaptureCandidate("I prefer Bahasa Indonesia for direct replies."),
    ).toMatchObject({ kind: "preference" });
    expect(
      normalizeCaptureCandidate("My favorite coffee shop is on Jalan Sudirman."),
    ).toMatchObject({ kind: "preference" });
  });

  it("captures clear availability and event statements", () => {
    expect(normalizeCaptureCandidate("I will be late to dinner on Friday.")).toMatchObject({
      kind: "availability",
    });
    expect(
      normalizeCaptureCandidate("I am attending the meeting on Tuesday morning."),
    ).toMatchObject({ kind: "event" });
  });

  it("ignores questions and interrogatives", () => {
    expect(normalizeCaptureCandidate("Do you remember when the meeting starts?")).toBeNull();
    expect(normalizeCaptureCandidate("What is my favorite color?")).toBeNull();
    expect(normalizeCaptureCandidate("Can you remind me about the trip?")).toBeNull();
    expect(normalizeCaptureCandidate("Where am I going on Friday?")).toBeNull();
  });

  it("ignores tiny acknowledgements and greetings", () => {
    expect(normalizeCaptureCandidate("ok")).toBeNull();
    expect(normalizeCaptureCandidate("thanks")).toBeNull();
    expect(normalizeCaptureCandidate("hi there")).toBeNull();
    expect(normalizeCaptureCandidate("got it.")).toBeNull();
  });

  it("ignores messages below the minimum length threshold", () => {
    expect(normalizeCaptureCandidate("I prefer tea")).toBeNull();
  });

  it("ignores slash-prefixed commands and empty input", () => {
    expect(normalizeCaptureCandidate("/help")).toBeNull();
    expect(normalizeCaptureCandidate("   ")).toBeNull();
  });

  it("requires a content pattern; generic statements without one are not captured", () => {
    expect(normalizeCaptureCandidate("The weather has been very nice this week.")).toBeNull();
  });
});

// Avoid the `pi-embedded` barrel here. Plugin loading can happen while the
// embedded-runner graph is still initializing, and the barrel's broad re-export
// surface can trip a circular import that leaves `abortEmbeddedPiRun` undefined.
export { runEmbeddedPiAgent } from "../../agents/pi-embedded-runner/run.js";

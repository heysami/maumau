import { describe, expect, test } from "vitest";
import { WizardSession } from "./session.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function noteRunner() {
  return new WizardSession(async (prompter) => {
    await prompter.note("Welcome");
    const name = await prompter.text({ message: "Name" });
    await prompter.note(`Hello ${name}`);
  });
}

describe("WizardSession", () => {
  test("intro provides helper copy for session-based clients", async () => {
    const session = new WizardSession(async (prompter) => {
      await prompter.intro("Maumau setup");
    });

    const first = await session.next();
    expect(first.done).toBe(false);
    expect(first.step?.type).toBe("note");
    expect(first.step?.title).toBe("Maumau setup");
    expect(first.step?.message).toBe("Continue when you're ready.");

    if (!first.step) {
      throw new Error("expected intro step");
    }
    await session.answer(first.step.id, null);

    const done = await session.next();
    expect(done.done).toBe(true);
    expect(done.status).toBe("done");
  });

  test("openUrl emits a client action step and returns the client result", async () => {
    const session = new WizardSession(async (prompter) => {
      await expect(
        prompter.openUrl?.("https://auth.openai.com/oauth/authorize?state=test", {
          title: "Open browser sign-in",
          message: "Open the sign-in page in your browser.",
        }),
      ).resolves.toBe(true);
    });

    const first = await session.next();
    expect(first.done).toBe(false);
    expect(first.step?.type).toBe("action");
    expect(first.step?.title).toBe("Open browser sign-in");
    expect(first.step?.message).toBe("Open the sign-in page in your browser.");
    expect(first.step?.executor).toBe("client");
    expect(first.step?.initialValue).toEqual({
      action: "open_url",
      url: "https://auth.openai.com/oauth/authorize?state=test",
    });

    if (!first.step) {
      throw new Error("expected openUrl step");
    }
    await session.answer(first.step.id, true);

    const done = await session.next();
    expect(done.done).toBe(true);
    expect(done.status).toBe("done");
  });

  test("steps progress in order", async () => {
    const session = noteRunner();

    const first = await session.next();
    expect(first.done).toBe(false);
    expect(first.step?.type).toBe("note");

    const secondPeek = await session.next();
    expect(secondPeek.step?.id).toBe(first.step?.id);

    if (!first.step) {
      throw new Error("expected first step");
    }
    await session.answer(first.step.id, null);

    const second = await session.next();
    expect(second.done).toBe(false);
    expect(second.step?.type).toBe("text");

    if (!second.step) {
      throw new Error("expected second step");
    }
    await session.answer(second.step.id, "Peter");

    const third = await session.next();
    expect(third.step?.type).toBe("note");

    if (!third.step) {
      throw new Error("expected third step");
    }
    await session.answer(third.step.id, null);

    const done = await session.next();
    expect(done.done).toBe(true);
    expect(done.status).toBe("done");
  });

  test("invalid answers throw", async () => {
    const session = noteRunner();
    const first = await session.next();
    await expect(session.answer("bad-id", null)).rejects.toThrow(/wizard: no pending step/i);
    if (!first.step) {
      throw new Error("expected first step");
    }
    await session.answer(first.step.id, null);
  });

  test("duplicate answers for the same step are ignored", async () => {
    const session = noteRunner();
    const first = await session.next();
    if (!first.step) {
      throw new Error("expected first step");
    }

    await session.answer(first.step.id, null);
    await expect(session.answer(first.step.id, null)).resolves.toBeUndefined();

    const second = await session.next();
    expect(second.done).toBe(false);
    expect(second.step?.type).toBe("text");
  });

  test("cancel marks session and unblocks", async () => {
    const session = new WizardSession(async (prompter) => {
      await prompter.text({ message: "Name" });
    });

    const step = await session.next();
    expect(step.step?.type).toBe("text");

    session.cancel();

    const done = await session.next();
    expect(done.done).toBe(true);
    expect(done.status).toBe("cancelled");
  });

  test("progress steps are surfaced and updated", async () => {
    const allowSecondUpdate = deferred();
    const secondUpdateShown = deferred();
    const allowReadyStep = deferred();
    const readyStepShown = deferred();

    const session = new WizardSession(async (prompter) => {
      const progress = prompter.progress("Gateway service");
      progress.update("Preparing Gateway service...");
      await allowSecondUpdate.promise;
      progress.update("Installing Gateway service...");
      secondUpdateShown.resolve();
      await allowReadyStep.promise;
      progress.stop("Gateway service installed.");
      const readyStep = prompter.note("Ready");
      readyStepShown.resolve();
      await readyStep;
    });

    const first = await session.next();
    expect(first.done).toBe(false);
    expect(first.step?.type).toBe("progress");
    expect(first.step?.title).toBe("Gateway service");
    expect(first.step?.message).toBe("Preparing Gateway service...");

    allowSecondUpdate.resolve();
    await secondUpdateShown.promise;

    const second = await session.next();
    expect(second.done).toBe(false);
    expect(second.step?.type).toBe("progress");
    expect(second.step?.id).toBe(first.step?.id);
    expect(second.step?.message).toBe("Installing Gateway service...");

    allowReadyStep.resolve();
    await readyStepShown.promise;

    const third = await session.next();
    expect(third.done).toBe(false);
    expect(third.step?.type).toBe("note");
    expect(third.step?.message).toBe("Ready");

    if (!third.step) {
      throw new Error("expected ready step");
    }
    await session.answer(third.step.id, null);

    const done = await session.next();
    expect(done.done).toBe(true);
    expect(done.status).toBe("done");
  });

  test("progress stop clears the current step before completion", async () => {
    const allowFinish = deferred();
    const stopped = deferred();

    const session = new WizardSession(async (prompter) => {
      const progress = prompter.progress("Gateway service");
      progress.update("Installing Gateway service...");
      await allowFinish.promise;
      progress.stop("Gateway service installed.");
      stopped.resolve();
    });

    const first = await session.next();
    expect(first.step?.type).toBe("progress");
    expect(first.step?.message).toBe("Installing Gateway service...");

    allowFinish.resolve();
    await stopped.promise;

    const done = await session.next();
    expect(done.done).toBe(true);
    expect(done.status).toBe("done");
  });
});

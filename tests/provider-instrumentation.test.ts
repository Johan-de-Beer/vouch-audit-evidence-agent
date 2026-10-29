import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import type { Document, ProviderCall } from "../shared/types.js";
import {
  extractFields,
  planTests,
  readCrop,
  segmentFields,
  transcribeAudio,
} from "../server/providers.js";
import { withProviderTrace } from "../server/provider-trace.js";

test("actual adapters retain safe chat/SAM/voice metadata, served models and failed HTTP request IDs", async () => {
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), "vouch-instrumentation-"),
  );
  const envNames = [
    "MODEL_API_KEY",
    "META_API_KEY",
    "META_BASE_URL",
    "BASETEN_API_KEY",
    "BASETEN_BASE_URL",
    "SPARK_MODEL",
    "SAM_MODEL",
    "VOICE_MODEL",
    "VERIFIER_MODEL",
  ];
  const prior = Object.fromEntries(
    envNames.map((name) => [name, process.env[name]]),
  );
  let failChat = false,
    sequence = 0;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    if (req.url === "/v1/responses") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "x-request-id": "request-sam",
      });
      const text =
        "<0f>1<|box;x1=0;y1=0;x2=4;y2=4;w=200;h=200;c=0.95|><|mask;x=0;y=0;c=0.95;data=5,5,!!!!!(QO(0lu8?|>";
      const response = {
        id: "response-sam",
        model: "sam-actually-served",
        status: "completed",
        usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
      };
      for (const event of [
        { type: "response.created", response },
        {
          type: "response.output_text.delta",
          item_id: "sam-item",
          output_index: 0,
          content_index: 0,
          delta: text,
        },
        {
          type: "response.content_part.done",
          item_id: "sam-item",
          output_index: 0,
          content_index: 0,
          part: { type: "output_text", text, annotations: [] },
        },
        { type: "response.completed", response },
      ])
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      res.end();
      return;
    }
    if (req.url === "/v1/asr/transcribe") {
      res.writeHead(200, {
        "content-type": "application/json",
        "x-request-id": "request-voice",
      });
      res.end(
        JSON.stringify({
          sessionId: "response-voice",
          model: "voice-actually-served",
          transcript: "Fictional private note.",
          turns: [],
        }),
      );
      return;
    }
    if (failChat) {
      res.writeHead(401, {
        "content-type": "application/json",
        "x-request-id": "request-failed",
      });
      res.end(
        JSON.stringify({
          error: {
            message: "Provider error body must stay private.",
            type: "authentication_error",
          },
        }),
      );
      return;
    }
    const body = JSON.parse(Buffer.concat(chunks).toString()),
      name = body.response_format?.json_schema?.name;
    const value =
      name === "audit_plan"
        ? { lines: [{ ledgerId: "L1", tests: ["amount"] }] }
        : name === "audit_fields"
          ? {
              fields: [
                {
                  name: "total",
                  value: 115,
                  bbox: [0, 0, 100, 30],
                  confidence: 0.99,
                },
              ],
            }
          : { value: 115, confidence: 0.99 };
    const model = req.url?.startsWith("/baseten/")
      ? "spark-open-actually-served"
      : "spark-actually-served";
    sequence++;
    res.writeHead(200, {
      "content-type": "application/json",
      "x-request-id": `request-chat-${sequence}`,
    });
    res.end(
      JSON.stringify({
        id: `response-chat-${sequence}`,
        model,
        object: "chat.completion",
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: JSON.stringify(value) },
            finish_reason: "stop",
          },
        ],
      }),
    );
  });
  try {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    process.env.MODEL_API_KEY = "synthetic-test-meta-key";
    delete process.env.META_API_KEY;
    process.env.BASETEN_API_KEY = "synthetic-test-baseten-key";
    process.env.META_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
    process.env.BASETEN_BASE_URL = `http://127.0.0.1:${address.port}/baseten/v1`;
    process.env.SPARK_MODEL = "spark-requested";
    process.env.SAM_MODEL = "sam-requested";
    process.env.VOICE_MODEL = "voice-requested";
    process.env.VERIFIER_MODEL = "open-requested";
    const image = path.join(temporary, "source.png");
    await sharp({
      create: { width: 200, height: 200, channels: 3, background: "white" },
    })
      .png()
      .toFile(image);
    const doc: Document = {
      id: "source",
      name: "Fictional invoice",
      type: "invoice",
      sha256: "",
      pages: 1,
      sourcePath: "source.png",
      imagePath: "source.png",
      width: 200,
      height: 200,
      synthetic: true,
    };
    const wav = Buffer.alloc(48);
    wav.write("RIFF");
    wav.writeUInt32LE(40, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(24000, 24);
    wav.writeUInt32LE(48000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(4, 40);
    const audio = path.join(temporary, "note.wav");
    await writeFile(audio, wav);
    const calls: ProviderCall[] = [];
    await withProviderTrace(
      (call) => calls.push(call),
      async () => {
        await planTests(
          [
            {
              id: "L1",
              date: "2026-10-01",
              vendor: "Fictional private vendor",
              invoice_no: "INV-TEST",
              amount: 115,
              vat: 15,
              account: "Test",
              currency: "ZAR",
            },
          ],
          [doc],
        );
        const fields = await extractFields(doc, image);
        assert.equal(fields[0].model, "spark-actually-served");
        const masks = await segmentFields(doc, image, fields);
        assert.equal(masks[0].model, "sam-actually-served");
        const verification = await readCrop(image, "total");
        assert.equal(verification.model, "spark-open-actually-served");
        await transcribeAudio(audio);
        failChat = true;
        await assert.rejects(() => extractFields(doc, image));
      },
    );
    assert.deepEqual(
      calls.map((call) => call.operation),
      ["plan", "extract", "segment", "verify", "transcribe", "extract"],
    );
    const chat = calls[1];
    assert.equal(chat.requestedModel, "spark-requested");
    assert.equal(chat.returnedModel, "spark-actually-served");
    assert.equal(chat.responseId, "response-chat-2");
    assert.equal(chat.requestId, "request-chat-2");
    assert.deepEqual(chat.usage, {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    });
    const sam = calls[2];
    assert.equal(sam.returnedModel, "sam-actually-served");
    assert.equal(sam.responseId, "response-sam");
    assert.equal(sam.requestId, "request-sam");
    assert.deepEqual(sam.usage, {
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
    });
    assert.equal(sam.outcome, "success");
    assert.equal(calls[4].responseId, "response-voice");
    assert.equal(calls[4].requestId, "request-voice");
    assert.equal(calls[4].returnedModel, "voice-actually-served");
    const failed = calls[5];
    assert.equal(failed.outcome, "failed");
    assert.equal(failed.httpStatus, 401);
    assert.equal(failed.requestId, "request-failed");
    const serialised = JSON.stringify(calls);
    for (const forbidden of [
      "synthetic-test-meta-key",
      "synthetic-test-baseten-key",
      "Fictional private vendor",
      "Fictional private note.",
      "Provider error body must stay private.",
    ])
      assert.ok(!serialised.includes(forbidden));
  } finally {
    for (const [name, value] of Object.entries(prior))
      value === undefined
        ? delete process.env[name]
        : (process.env[name] = value);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(temporary, { recursive: true, force: true });
  }
});

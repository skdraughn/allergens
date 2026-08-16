import assert from "node:assert/strict";
import test from "node:test";

import {
  bucketCount,
  eventParameterKeys,
  performanceTraceNames,
  sanitizeEvent,
  sanitizeTraceAttributes,
} from "./schema.ts";

test("all event and trace names satisfy Firebase limits", () => {
  for (const name of Object.keys(eventParameterKeys)) {
    assert.match(name, /^[a-z][a-z0-9_]{0,39}$/);
    assert.ok(eventParameterKeys[name as keyof typeof eventParameterKeys].length <= 23);
  }
  for (const name of performanceTraceNames) {
    assert.match(name, /^[a-z][a-z0-9_]{0,99}$/);
  }
});

test("event schemas use bounded Firebase-compatible parameter keys", () => {
  for (const keys of Object.values(eventParameterKeys)) {
    for (const key of keys) {
      assert.match(key, /^[a-z][a-z0-9_]{0,39}$/);
    }
  }
});

test("sanitization adds schema metadata and normalizes controlled values", () => {
  assert.deepEqual(
    sanitizeEvent(
      "restaurant_opened",
      {
        entry_point: "Home Search",
        restaurant_id: "restaurant:123",
        result_position_bucket: "2-5",
      },
      { environment: "Production", strict: true },
    ),
    {
      app_environment: "production",
      entry_point: "home_search",
      restaurant_id: "restaurant:123",
      result_position_bucket: "2-5",
      schema_version: 1,
    },
  );
});

test("unknown parameters are rejected in development", () => {
  assert.throws(
    () =>
      sanitizeEvent(
        "restaurant_opened",
        { unexpected_context: "value" },
        { environment: "development", strict: true },
      ),
    /Unknown parameter/,
  );
});

test("unknown parameters are dropped in release mode", () => {
  assert.deepEqual(
    sanitizeEvent(
      "restaurant_opened",
      { unexpected_context: "value" },
      { environment: "production" },
    ),
    { app_environment: "production", schema_version: 1 },
  );
});

test("sensitive and user-entered fields can never pass the adapter", () => {
  const prohibitedKeys = [
    "email",
    "allergy_ids",
    "search_query",
    "review_text",
    "request_notes",
    "report_body",
    "latitude",
    "auth_token",
  ];

  for (const key of prohibitedKeys) {
    assert.throws(
      () =>
        sanitizeEvent(
          "restaurant_search_results",
          { [key]: "private" },
          { environment: "production" },
        ),
      new RegExp(`Prohibited telemetry parameter: ${key}`),
    );
  }
});

test("performance traces enforce their schema and sensitive-key firewall", () => {
  assert.deepEqual(
    sanitizeTraceAttributes(
      "restaurant_search",
      { result_count_bucket: "2_5" },
      true,
    ),
    { result_count_bucket: "2_5" },
  );
  assert.throws(
    () =>
      sanitizeTraceAttributes(
        "restaurant_search",
        { search_query: "private" },
        false,
      ),
    /Prohibited telemetry parameter/,
  );
  assert.throws(
    () =>
      sanitizeTraceAttributes(
        "restaurant_search",
        { unexpected_context: "value" },
        true,
      ),
    /Unknown trace attribute/,
  );
});

test("unsafe identifiers are rejected or dropped", () => {
  assert.throws(
    () =>
      sanitizeEvent(
        "restaurant_opened",
        { restaurant_id: "free text with spaces" },
        { environment: "development", strict: true },
      ),
    /Unsafe identifier/,
  );
  assert.equal(
    sanitizeEvent(
      "restaurant_opened",
      { restaurant_id: "free text with spaces" },
      { environment: "production" },
    ).restaurant_id,
    undefined,
  );
});

test("result counts are bucketed instead of sent as high-cardinality values", () => {
  assert.equal(bucketCount(0), "0");
  assert.equal(bucketCount(4), "2_5");
  assert.equal(bucketCount(87), "51_100");
  assert.equal(bucketCount(1000), "101_plus");
});

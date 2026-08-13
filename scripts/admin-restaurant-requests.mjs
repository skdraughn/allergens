#!/usr/bin/env node
import { createServer } from "node:http";
import { Buffer } from "node:buffer";

import { DynamoDBClient, ListTablesCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
const port = Number(process.env.PORT || 4177);
const explicitTableName = process.env.RESTAURANT_REQUEST_TABLE;
const requestTablePrefix = "RestaurantRequest-";
const allowedStatuses = new Set(["pending", "approved", "rejected"]);

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

let resolvedTableName = explicitTableName || "";

async function resolveTableName() {
  if (resolvedTableName) {
    return resolvedTableName;
  }

  const tables = await dynamo.send(new ListTablesCommand({}));
  const candidates = (tables.TableNames ?? [])
    .filter((name) => name.startsWith(requestTablePrefix))
    .sort();

  if (candidates.length === 0) {
    throw new Error("Could not find a RestaurantRequest table in this AWS account.");
  }

  resolvedTableName = candidates.at(-1) ?? "";
  return resolvedTableName;
}

async function listRequests(status = "pending") {
  const tableName = await resolveTableName();
  const result = await dynamo.send(
    new ScanCommand({
      TableName: tableName,
      Limit: 200,
    }),
  );
  const items = (result.Items ?? []).map(normalizeRequest);
  const filtered =
    status === "all" ? items : items.filter((item) => item.status === status);

  return filtered.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

async function updateRequestStatus({ id, reviewNotes, status }) {
  if (!id || typeof id !== "string") {
    throw new Error("Missing request id.");
  }

  if (!allowedStatuses.has(status)) {
    throw new Error("Invalid status.");
  }

  const tableName = await resolveTableName();
  const now = new Date().toISOString();

  await dynamo.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { id },
      UpdateExpression: "SET #status = :status, reviewNotes = :reviewNotes, updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":reviewNotes": String(reviewNotes ?? "").trim(),
        ":status": status,
        ":updatedAt": now,
      },
      ConditionExpression: "attribute_exists(id)",
    }),
  );

  return { id, reviewNotes, status, updatedAt: now };
}

function normalizeRequest(item) {
  return {
    addressLine1: stringValue(item.addressLine1),
    addressLine2: stringValue(item.addressLine2),
    city: stringValue(item.city),
    country: stringValue(item.country),
    createdAt: stringValue(item.createdAt),
    createdBy: stringValue(item.createdBy || item.owner),
    displayAddress: stringValue(item.displayAddress),
    googleMapsUri: stringValue(item.googleMapsUri),
    googlePlaceId: stringValue(item.googlePlaceId),
    id: stringValue(item.id),
    lat: numberValue(item.lat),
    lng: numberValue(item.lng),
    locationHint: stringValue(item.locationHint),
    name: stringValue(item.name) || "Restaurant request",
    notes: stringValue(item.notes),
    postalCode: stringValue(item.postalCode),
    region: stringValue(item.region),
    reviewNotes: stringValue(item.reviewNotes),
    status: allowedStatuses.has(item.status) ? item.status : "pending",
    updatedAt: stringValue(item.updatedAt),
    website: stringValue(item.website),
  };
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function html(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "text/html; charset=utf-8",
  });
  response.end(body);
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (request.method === "GET" && url.pathname === "/") {
      html(response, 200, pageHtml);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/requests") {
      const status = url.searchParams.get("status") || "pending";
      const requests = await listRequests(status);
      json(response, 200, {
        requests,
        tableName: await resolveTableName(),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/requests/status") {
      const body = await readJsonBody(request);
      const updated = await updateRequestStatus(body);
      json(response, 200, { updated });
      return;
    }

    json(response, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    json(response, 500, {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

server.listen(port, () => {
  console.log(`Restaurant request admin: http://localhost:${port}`);
  console.log(`AWS profile: ${process.env.AWS_PROFILE || "(default)"}`);
  console.log(`AWS region: ${region}`);
});

const pageHtml = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Restaurant Requests</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f7fa;
        --card: #ffffff;
        --ink: #111111;
        --muted: #74777c;
        --line: rgba(17,17,17,0.1);
        --blue: #007aff;
        --blue-soft: #eaf4ff;
        --danger: #b84d67;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
      }
      main {
        margin: 0 auto;
        max-width: 1100px;
        padding: 44px 22px 80px;
      }
      header {
        align-items: flex-end;
        display: flex;
        gap: 18px;
        justify-content: space-between;
        margin-bottom: 22px;
      }
      h1 {
        font-size: clamp(34px, 5vw, 54px);
        letter-spacing: 0;
        line-height: 1;
        margin: 0 0 8px;
      }
      .subtitle {
        color: var(--muted);
        font-size: 17px;
        font-weight: 650;
        margin: 0;
      }
      .toolbar {
        align-items: center;
        display: flex;
        gap: 10px;
      }
      select, button, textarea {
        font: inherit;
      }
      select {
        appearance: none;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 14px;
        color: var(--ink);
        font-size: 15px;
        font-weight: 750;
        min-height: 42px;
        padding: 0 34px 0 14px;
      }
      button {
        background: var(--blue);
        border: 0;
        border-radius: 14px;
        color: #fff;
        cursor: pointer;
        font-size: 14px;
        font-weight: 850;
        min-height: 38px;
        padding: 0 14px;
      }
      button.secondary {
        background: #f2f2f7;
        color: var(--ink);
      }
      button.danger {
        background: rgba(184,77,103,0.12);
        color: var(--danger);
      }
      button:disabled {
        cursor: default;
        opacity: 0.45;
      }
      .meta {
        color: var(--muted);
        font-size: 13px;
        font-weight: 700;
        margin: 0 0 18px;
      }
      .list {
        display: grid;
        gap: 14px;
      }
      .card {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 20px;
        overflow: hidden;
      }
      .card-top {
        align-items: flex-start;
        display: flex;
        gap: 16px;
        justify-content: space-between;
        padding: 18px;
      }
      .name {
        font-size: 22px;
        font-weight: 900;
        line-height: 1.08;
        margin: 0 0 5px;
      }
      .details {
        color: var(--muted);
        font-size: 14px;
        font-weight: 650;
        line-height: 1.35;
        margin: 0;
        white-space: pre-wrap;
      }
      .status {
        border-radius: 999px;
        font-size: 12px;
        font-weight: 950;
        padding: 7px 10px;
        text-transform: capitalize;
        white-space: nowrap;
      }
      .status.pending { background: #fff6e5; color: #a66a00; }
      .status.approved { background: #eaf8ef; color: #167a3d; }
      .status.rejected { background: #fff0f0; color: var(--danger); }
      .section {
        border-top: 1px solid var(--line);
        display: grid;
        gap: 10px;
        padding: 14px 18px 18px;
      }
      .label {
        color: var(--muted);
        font-size: 12px;
        font-weight: 850;
        margin: 0 0 3px;
        text-transform: uppercase;
      }
      .copy {
        color: var(--ink);
        font-size: 14px;
        font-weight: 650;
        line-height: 1.38;
        margin: 0;
        white-space: pre-wrap;
      }
      .links {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      a {
        color: var(--blue);
        font-weight: 800;
        text-decoration: none;
      }
      textarea {
        background: #f7f7fa;
        border: 1px solid var(--line);
        border-radius: 14px;
        color: var(--ink);
        min-height: 74px;
        padding: 12px;
        resize: vertical;
        width: 100%;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .empty {
        align-items: center;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 20px;
        color: var(--muted);
        display: flex;
        font-size: 16px;
        font-weight: 750;
        justify-content: center;
        min-height: 180px;
      }
      @media (max-width: 720px) {
        header {
          align-items: flex-start;
          flex-direction: column;
        }
        .toolbar {
          width: 100%;
        }
        select, .toolbar button {
          flex: 1;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Restaurant Requests</h1>
          <p class="subtitle">Review user-submitted restaurants before adding them to the pipeline.</p>
        </div>
        <div class="toolbar">
          <select id="statusFilter" aria-label="Status filter">
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </select>
          <button id="refreshButton" class="secondary">Refresh</button>
        </div>
      </header>
      <p class="meta" id="meta">Loading…</p>
      <section class="list" id="list"></section>
    </main>
    <script>
      const list = document.getElementById("list");
      const meta = document.getElementById("meta");
      const filter = document.getElementById("statusFilter");
      const refreshButton = document.getElementById("refreshButton");

      refreshButton.addEventListener("click", load);
      filter.addEventListener("change", load);
      load();

      async function load() {
        refreshButton.disabled = true;
        meta.textContent = "Loading…";
        list.innerHTML = "";
        try {
          const response = await fetch("/api/requests?status=" + encodeURIComponent(filter.value));
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "Could not load requests.");
          meta.textContent = payload.requests.length + " request(s) • " + payload.tableName;
          render(payload.requests);
        } catch (error) {
          meta.textContent = error.message;
          list.innerHTML = '<div class="empty">Could not load requests.</div>';
        } finally {
          refreshButton.disabled = false;
        }
      }

      function render(requests) {
        if (!requests.length) {
          list.innerHTML = '<div class="empty">No requests for this filter.</div>';
          return;
        }
        list.innerHTML = "";
        for (const request of requests) {
          const card = document.createElement("article");
          card.className = "card";
          card.innerHTML = cardHtml(request);
          card.querySelector("[data-action='pending']").addEventListener("click", () => update(request.id, "pending", card));
          card.querySelector("[data-action='approved']").addEventListener("click", () => update(request.id, "approved", card));
          card.querySelector("[data-action='rejected']").addEventListener("click", () => update(request.id, "rejected", card));
          list.appendChild(card);
        }
      }

      function cardHtml(request) {
        const address = request.displayAddress || [request.addressLine1, request.addressLine2, request.city, request.region, request.postalCode, request.country].filter(Boolean).join("\\n");
        const mapsUrl = request.googleMapsUri || (request.lat && request.lng ? "https://www.google.com/maps/search/?api=1&query=" + request.lat + "," + request.lng : "");
        return \`
          <div class="card-top">
            <div>
              <h2 class="name">\${escapeHtml(request.name)}</h2>
              <p class="details">\${escapeHtml(request.locationHint || address || request.website || "No location supplied")}</p>
            </div>
            <span class="status \${escapeHtml(request.status)}">\${escapeHtml(request.status)}</span>
          </div>
          <div class="section">
            <div>
              <p class="label">Submitted</p>
              <p class="copy">\${escapeHtml(formatDate(request.createdAt))} by \${escapeHtml(request.createdBy || "anonymous")}</p>
            </div>
            \${address ? \`<div><p class="label">Address</p><p class="copy">\${escapeHtml(address)}</p></div>\` : ""}
            \${request.notes ? \`<div><p class="label">Notes</p><p class="copy">\${escapeHtml(request.notes)}</p></div>\` : ""}
            <div class="links">
              \${request.website ? \`<a href="\${escapeAttr(request.website)}" target="_blank" rel="noreferrer">Website</a>\` : ""}
              \${mapsUrl ? \`<a href="\${escapeAttr(mapsUrl)}" target="_blank" rel="noreferrer">Map</a>\` : ""}
              \${request.googlePlaceId ? \`<span class="details">Place ID: \${escapeHtml(request.googlePlaceId)}</span>\` : ""}
            </div>
            <textarea placeholder="Internal review notes">\${escapeHtml(request.reviewNotes || "")}</textarea>
            <div class="actions">
              <button data-action="approved">Approve</button>
              <button class="danger" data-action="rejected">Reject</button>
              <button class="secondary" data-action="pending">Mark pending</button>
            </div>
          </div>
        \`;
      }

      async function update(id, status, card) {
        const reviewNotes = card.querySelector("textarea").value;
        const buttons = card.querySelectorAll("button");
        buttons.forEach((button) => button.disabled = true);
        try {
          const response = await fetch("/api/requests/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, reviewNotes, status }),
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "Could not update request.");
          await load();
        } catch (error) {
          alert(error.message);
          buttons.forEach((button) => button.disabled = false);
        }
      }

      function formatDate(value) {
        if (!value) return "Unknown date";
        const date = new Date(value);
        return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
      }

      function escapeHtml(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
      }

      function escapeAttr(value) {
        return escapeHtml(value);
      }
    </script>
  </body>
</html>`;
